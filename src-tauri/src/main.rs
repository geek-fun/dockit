// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::env;
use std::option::Option;
use std::str::FromStr;

use async_openai::{Client, config::OpenAIConfig};
use async_openai::types::{AssistantStreamEvent, CreateAssistantRequest, CreateMessageRequest, CreateRunRequest, CreateThreadRequest, MessageRole, ModifyAssistantRequest};
use futures::{StreamExt};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::json;

mod menu;

static OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

fn get_proxy(http_proxy: Option<String>) -> Option<String> {
    let sys_proxy= env::var("HTTPS_PROXY").ok().or(env::var("https_proxy").ok());
    let proxy_url = match http_proxy {
        Some(proxy) => {
            if proxy.is_empty() { sys_proxy } else { Some(proxy.clone()) }
        }
        None => sys_proxy
    };
    println!("proxy_url: {:?}", proxy_url);
    return proxy_url;
}


fn create_http_client(proxy: Option<String>, ssl: Option<bool>) -> reqwest::Client {
    let mut builder = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(!ssl.unwrap_or(true));

    if let Some(proxy_url) = get_proxy(proxy) {
        match reqwest::Proxy::https(&proxy_url) {
            Ok(proxy) => {
                builder = builder.proxy(proxy);
                println!("Proxy set to: {}", proxy_url);
            }
            Err(e) => {
                println!("Failed to create proxy: {}", e);
            }
        };
    }

    return builder.build().unwrap();
}

async fn validate_openai(api_key: &str, model: &str, proxy: Option<String>) -> bool {
    let http_client = create_http_client(proxy, None);
    let url = format!("{}/engines/{}", OPENAI_BASE_URL, model);

    let resp = http_client.get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(response) => { response.status().is_success() }
        Err(err) => {
            println!("Failed to validate OpenAI API Key or Model: {:?}", err);
            false
        }
    }
}


fn headermap_from_hashmap<'a, I, S>(headers: I) -> HeaderMap
where
    I: Iterator<Item=(S, S)> + 'a,
    S: AsRef<str> + 'a,
{
    headers
        .map(|(name, val)| (HeaderName::from_str(name.as_ref()), HeaderValue::from_str(val.as_ref())))
        // We ignore the errors here. If you want to get a list of failed conversions, you can use Iterator::partition
        // to help you out here
        .filter(|(k, v)| k.is_ok() && v.is_ok())
        .map(|(k, v)| (k.unwrap(), v.unwrap()))
        .collect()
}

static mut OPENAI_CLIENT: Option<Client<OpenAIConfig>> = None;

#[tauri::command]
async fn create_openai_client(api_key: String, model: String, http_proxy: Option<String>) -> Result<String, String> {
    let is_valid = validate_openai(&api_key, &model, http_proxy.clone()).await;
    if !is_valid {
        return Err("Invalid OpenAI API Key or Model".into());
    }

    let config = OpenAIConfig::new().with_api_key(api_key).with_api_base(OPENAI_BASE_URL);

    let http_client = create_http_client(http_proxy, None);
    unsafe {
        OPENAI_CLIENT = Option::from(Client::with_config(config).with_http_client(http_client));
    }

    return Ok("OpenAI client created".to_string());
}

static mut FETCH_SECURE_CLIENT: Option<reqwest::Client> = None;
static mut FETCH_INSECURE_CLIENT: Option<reqwest::Client> = None;

#[derive(Deserialize)]
struct Agent {
    ssl: bool,
    http_proxy: Option<String>,
}

#[derive(Deserialize)]
struct FetchApiOptions {
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    agent: Agent,
}

#[tauri::command]
async fn fetch_api(url: String, options: FetchApiOptions) -> Result<String, String> {
    let client = unsafe {
        match options.agent.ssl {
            true => {
                if FETCH_SECURE_CLIENT.is_none() {
                    FETCH_SECURE_CLIENT = Option::from(create_http_client(options.agent.http_proxy, Some(options.agent.ssl)));
                }
                FETCH_SECURE_CLIENT.as_ref().unwrap()
            }
            false => {
                println!("Insecure client used");
                if FETCH_INSECURE_CLIENT.is_none() {
                    FETCH_INSECURE_CLIENT = Option::from(create_http_client(options.agent.http_proxy, Some(options.agent.ssl)));
                }
                FETCH_INSECURE_CLIENT.as_ref().unwrap()
            }
        }
    };

    println!("Fetching API: {}, {}, {:?}", url, reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(), options.headers);
    let response = client
        .request(reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(), &url)
        .headers(headermap_from_hashmap(options.headers.iter()))
        .body(options.body.unwrap_or_default())
        .send()
        .await;

    match response {
        Ok(resp) => {
            let is_success = resp.status().is_success();
            let status_code = resp.status().as_u16();
            let body = resp.text().await;
            match body {
                Ok(body) => {
                    let data: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!(null));
                    let message = if is_success {
                        "Success".to_string()
                    } else {
                        println!("error message: {:?}", body);
                        "Failed to fetch API".to_string()
                    };
                    let result = json!({
                        "status": status_code,
                        "message": message,
                        "data": data
                    });
                    println!("build response structure rust,result: {:?}", result);
                    Ok(result.to_string())
                }
                Err(e) => {
                    let result = json!({
                        "status": 500,
                        "message": format!("Failed to read response body {}", e),
                        "data": Option::<serde_json::Value>::None,
                    });
                    Err(result.to_string())
                }
            }
        }
        Err(e) => {
            let result = json!({
                "status": 500,
                "message": format!("Failed to fetch API {}", e),
                "data": Option::<serde_json::Value>::None,
            });
            println!("{}", e);
            Err(result.to_string())
        }
    }
}

#[tauri::command]
async fn find_assistant(api_key: String, assistant_id: String, model: String, http_proxy: Option<String>) -> Result<String, String> {
    let openai_client = match unsafe { OPENAI_CLIENT.as_ref() } {
        Some(client) => client.clone(),
        None => {
            create_openai_client(api_key, model, http_proxy).await?;
            match unsafe { OPENAI_CLIENT.as_ref() } {
                Some(client) => client.clone(),
                None => {
                    let result = json!({
                        "status": 500,
                        "message":"Failed to create openai client".to_string(),
                        "data":Option::<serde_json::Value>::None,
                    });
                    return Err(result.to_string());
                }
            }
        }
    };

    let assistant = openai_client.assistants().retrieve(&assistant_id).await;
    match assistant {
        Ok(assistant) => {
            let result = json!({
                "status": 200,
                "message":"Success".to_string(),
                "data": {
                     "assistant_id": assistant.id,
                 }
            });
            Ok(result.to_string())
        }
        Err(e) => {
            match &e {
                async_openai::error::OpenAIError::ApiError(e) => {
                    let message = e.message.clone();
                    if message.starts_with("No assistant found") {
                        let result = json!({
                            "status": 404,
                            "message": message,
                            "data": Option::<serde_json::Value>::None,
                        });
                        return Err(result.to_string());
                    }
                }
                _ => {}
            }

            let result = json!({
                "status": 500,
                "message": e.to_string(),
                "data":Option::<serde_json::Value>::None,
            });
            Err(result.to_string())
        }
    }
}

static ASSISTANT_NAME: &str = "dockit-assistant";

#[tauri::command]
async fn modify_assistant(api_key: String, assistant_id: String, model: String, instructions: String, http_proxy: Option<String>) -> Result<String, String> {
    let openai_client = match unsafe { OPENAI_CLIENT.as_ref() } {
        Some(client) => client.clone(),
        None => {
            create_openai_client(api_key, model.clone(), http_proxy).await?;
            match unsafe { OPENAI_CLIENT.as_ref() } {
                Some(client) => client.clone(),
                None => {
                    let result = json!({
                        "status": 500,
                        "message":"Failed to create openai client".to_string(),
                        "data":Option::<serde_json::Value>::None,
                    });
                    return Err(result.to_string());
                }
            }
        }
    };

    let assistant = openai_client.assistants().update(&assistant_id, ModifyAssistantRequest {
        name: Option::from(ASSISTANT_NAME.to_string()),
        model: Some(model),
        instructions: Some(instructions),
        ..Default::default()
    }).await;

    match assistant {
        Ok(assistant) => {
            let result = json!({
                "status": 200,
                "message":"Success".to_string(),
                "data": {
                     "assistant_id": assistant.id,
                 }
            });
            Ok(result.to_string())
        }
        Err(e) => {
            println!("error to get assistant {}", e);
            let result = json!({
                "status": 500,
                "message":"Success".to_string(),
                "data":Option::<serde_json::Value>::None,
            });
            Err(result.to_string())
        }
    }
}

#[tauri::command]
async fn create_assistant(api_key: String, model: String, instructions: String, http_proxy: Option<String>) -> Result<String, String> {
    let openai_client = match unsafe { OPENAI_CLIENT.as_ref() } {
        Some(client) => client.clone(),
        None => {
            create_openai_client(api_key, model.clone(), http_proxy).await?;
            match unsafe { OPENAI_CLIENT.as_ref() } {
                Some(client) => client.clone(),
                None => {
                    let result = json!({
                        "status": 500,
                        "message":"Failed to create openai client".to_string(),
                        "data":Option::<serde_json::Value>::None,
                    });
                    return Err(result.to_string());
                }
            }
        }
    };
    // Step 1: Create assistant
    let assistant = openai_client.assistants().create(CreateAssistantRequest {
        name: Option::from(ASSISTANT_NAME.to_string()),
        model,
        instructions: Some(instructions),
        ..Default::default()
    }).await;
    if assistant.is_err() {
        // if !assistant.is_ok() {
        let result = json!({
        "status": 500,
        "message":"Failed to create assistant".to_string(),
        "data":Option::<serde_json::Value>::None,
    });
        return Err(result.to_string());
    }
    // Step 2: Create a Thread
    let thread = openai_client.threads().create(CreateThreadRequest::default()).await;
    if thread.is_err() {
        let result = json!({
        "status": 500,
        "message":"Failed to create thread".to_string(),
        "data":Option::<serde_json::Value>::None,
    });
        return Err(result.to_string());
    }
    let result = json!(
    {
        "status": 200,
        "message":"Success".to_string(),
        "data": {
            "assistant_id": assistant.unwrap().id,
            "thread_id": thread.unwrap().id,
        }
    });

    return Ok(result.to_string());
}


#[tauri::command]
async fn chat_assistant(window: tauri::Window, assistant_id: String, thread_id: String, question: String) -> Result<String, String> {
    let openai_client = match unsafe { OPENAI_CLIENT.as_ref() } {
        Some(client) => client.clone(),
        None => {
            let result = json!({
                "status": 500,
                "message":"OpenAI client not found".to_string(),
                "data":Option::<serde_json::Value>::None,
            });
            return Err(result.to_string());
        }
    };
    println!("start sending message to openai");
    let _message = openai_client
        .threads()
        .messages(&thread_id)
        .create(CreateMessageRequest {
            role: MessageRole::User,
            content: question.into(),
            ..Default::default()
        })
        .await;
    let mut event_stream = openai_client
        .threads()
        .runs(&thread_id)
        .create_stream(CreateRunRequest {
            assistant_id,
            stream: Some(true),
            ..Default::default()
        })
        .await
        .map_err(|e| e.to_string())?; // Convert the error to a string

    println!("event_stream start");

    // let mut task_handle = None;
    while let Some(event) = event_stream.next().await {
        match event {
            Ok(event) => match event {
                AssistantStreamEvent::ThreadMessageCreated(msg_object) => {
                    let msg = json!({
                        "role": "BOT",
                        "content": msg_object.content,
                        "state": "CREATED"
                    });
                    window.emit("chatbot-message", msg.to_string()).unwrap();
                    println!("thread.run.thread_message_created: msg_object:{:?}", msg_object);
                }
                AssistantStreamEvent::ThreadMessageDelta(msg_object) => {
                    println!("thread.run.thread_message_delta: msg_object:{:?}", msg_object);
                    let msg = json!({
                        "role": "BOT",
                        "content": msg_object.delta.content,
                        "state": "IN_PROGRESS"
                    });
                    window.emit("chatbot-message", msg.to_string()).unwrap();
                }
                AssistantStreamEvent::ThreadMessageCompleted(msg_object) => {
                    let msg = json!({
                        "role": "BOT",
                        "content": msg_object.content,
                        "state": "COMPLETED"
                    });
                    window.emit("chatbot-message", msg.to_string()).unwrap();
                    println!("thread.run.thread_message_completed: msg_object:{:?}", msg_object);
                }
                AssistantStreamEvent::ThreadRunFailed(run_object) => {
                    println!("thread.run.thread_run_completed: run_object:{:?}", run_object);
                    let result = json!({
                    "status": 500,
                    "message": run_object.last_error,
                    "data":Option::<serde_json::Value>::None,
                });
                    return Err(result.to_string());
                }
                event => {
                    println!("\nEvent: {event:?}\n, {:?}", event);
                }
            },
            Err(e) => {
                let result = json!({
                    "status": 500,
                    "message":"Failed to get stream response".to_string(),
                    "data":Option::<serde_json::Value>::None,
                });
                eprintln!("Error: {:?}", e);
                return Err(result.to_string());
            }
        }
    }

    let result = json!({
            "status": 200,
            "message":"Success".to_string(),
            "data":Option::<serde_json::Value>::None,
        });
    Ok(result.to_string())
}

static mut DEV_TOOLS_OPEN: bool = false;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_system_info::init())
        .invoke_handler(tauri::generate_handler![create_openai_client,fetch_api,find_assistant, modify_assistant, create_assistant,chat_assistant])
        .menu(menu::create_menu())
        .on_menu_event(menu::menu_event_handler)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
