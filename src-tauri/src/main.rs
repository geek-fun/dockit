// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::env;
use std::option::Option;
use std::str::FromStr;

use async_openai::{Client, config::OpenAIConfig};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::json;
use tauri::Manager;

fn create_http_client(proxy: Option<String>, ssl: Option<bool>) -> reqwest::Client {
    let mut builder = reqwest::ClientBuilder::new().user_agent("async-openai");

    if let Some(proxy_url) = proxy {
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

    builder = builder.danger_accept_invalid_certs(
        ssl.map_or(false, |ssl_validate| !ssl_validate)
    );

    return builder.build().unwrap();
}

async fn validate_openai(api_key: &str, model: &str, proxy: Option<String>) -> bool {
    let http_client = create_http_client(proxy, None);
    let url = format!("https://api.openai.com/v1/engines/{}", model);

    let resp = http_client.get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(response) => {
            if response.status().is_success() {
                true
            } else {
                false
            }
        }
        Err(_) => false,
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
    if !is_valid { return Err("Invalid OpenAI API Key or Model".into()); }

    let config = OpenAIConfig::new().with_api_key(api_key);
    let proxy_url = match http_proxy {
        Some(proxy) => {
            if proxy.is_empty() { env::var("HTTPS_PROXY").ok() } else { Some(proxy.clone()) }
        }
        None => env::var("HTTPS_PROXY").ok(),
    };


    let http_client = create_http_client(proxy_url, None);
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
                    FETCH_SECURE_CLIENT = Option::from(create_http_client(None, Some(true)));
                }
                FETCH_SECURE_CLIENT.as_ref().unwrap()
            }
            false => {
                if FETCH_INSECURE_CLIENT.is_none() {
                    FETCH_INSECURE_CLIENT = Option::from(create_http_client(None, Some(false)));
                }
                FETCH_INSECURE_CLIENT.as_ref().unwrap()
            }
        }
    };
    // let headers = convert_hashmap_to_headermap(options.headers);
    println!("Fetching API: {}, {}", url, options.method);
    let response = client.request(reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(), &url)
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
                    let message = if is_success {
                        "Success".to_string()
                    } else {
                        "Failed to fetch API".to_string()
                    };
                    let data: serde_json::Value = serde_json::from_str(&body).unwrap_or(json!(null));
                    let result = json!({
                        "status": status_code,
                        "message": message,
                        "data": data
                    });
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_system_info::init())
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
                window.close_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![create_openai_client,fetch_api])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
