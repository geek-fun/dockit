use async_openai::types::{
    AssistantStreamEvent, CreateAssistantRequest, CreateMessageRequest, CreateRunRequest,
    CreateThreadRequest, MessageRole, ModifyAssistantRequest,
};
use serde_json::json;

use async_openai::{config::OpenAIConfig, Client};
use tauri::Emitter;
use futures::StreamExt;

use crate::common::http_client::create_http_client;

static OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

static mut OPENAI_CLIENT: Option<Client<OpenAIConfig>> = None;

async fn validate_openai(api_key: &str, model: &str, proxy: Option<String>) -> bool {
    let http_client = create_http_client(proxy, None);
    let url = format!("{}/engines/{}", OPENAI_BASE_URL, model);

    let resp = http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(response) => response.status().is_success(),
        Err(_err) => false,
    }
}


#[tauri::command]
pub async fn create_openai_client(
    api_key: String,
    model: String,
    http_proxy: Option<String>,
) -> Result<String, String> {
    let is_valid = validate_openai(&api_key, &model, http_proxy.clone()).await;
    if !is_valid {
        return Err("Invalid OpenAI API Key or Model".into());
    }

    let config = OpenAIConfig::new()
        .with_api_key(api_key)
        .with_api_base(OPENAI_BASE_URL);

    let http_client = create_http_client(http_proxy, None);
    unsafe {
        OPENAI_CLIENT = Option::from(Client::with_config(config).with_http_client(http_client));
    }

    return Ok("OpenAI client created".to_string());
}


#[tauri::command]
pub async fn find_assistant(
    api_key: String,
    assistant_id: String,
    model: String,
    http_proxy: Option<String>,
) -> Result<String, String> {
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
pub async fn modify_assistant(
    api_key: String,
    assistant_id: String,
    model: String,
    instructions: String,
    http_proxy: Option<String>,
) -> Result<String, String> {
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

    let assistant = openai_client
        .assistants()
        .update(
            &assistant_id,
            ModifyAssistantRequest {
                name: Option::from(ASSISTANT_NAME.to_string()),
                model: Some(model),
                instructions: Some(instructions),
                ..Default::default()
            },
        )
        .await;

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
            let result = json!({
                "status": 500,
                "message": e.to_string(),
                "data":Option::<serde_json::Value>::None,
            });
            Err(result.to_string())
        }
    }
}

#[tauri::command]
pub async fn create_assistant(
    api_key: String,
    model: String,
    instructions: String,
    http_proxy: Option<String>,
) -> Result<String, String> {
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
    let assistant = openai_client
        .assistants()
        .create(CreateAssistantRequest {
            name: Option::from(ASSISTANT_NAME.to_string()),
            model,
            instructions: Some(instructions),
            ..Default::default()
        })
        .await;
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
    let thread = openai_client
        .threads()
        .create(CreateThreadRequest::default())
        .await;
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
pub async fn chat_assistant(
    window: tauri::Window,
    assistant_id: String,
    thread_id: String,
    question: String,
) -> Result<String, String> {
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
                }
                AssistantStreamEvent::ThreadMessageDelta(msg_object) => {
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
                }
                AssistantStreamEvent::ThreadRunFailed(run_object) => {
                    let result = json!({
                        "status": 500,
                        "message": run_object.last_error,
                        "data":Option::<serde_json::Value>::None,
                    });
                    return Err(result.to_string());
                }
                _event => {}
            },
            Err(_e) => {
                let result = json!({
                    "status": 500,
                    "message":"Failed to get stream response".to_string(),
                    "data":Option::<serde_json::Value>::None,
                });
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
