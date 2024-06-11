// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::option::Option;

use async_openai::{Client, config::OpenAIConfig};
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn create_http_client(proxy: Option<String>) -> reqwest::Client {
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

    return builder.build().unwrap();
}

async fn validate_openai(api_key: &str, model: &str, proxy: Option<String>) -> bool {
    let http_client = create_http_client(proxy);
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

static mut OPENAI_CLIENT: Option<Client<OpenAIConfig>> = None;

#[tauri::command]
async fn create_openai_client(api_key: String, model: String, http_proxy: Option<String>) -> Result<String, String> {
    let is_valid = validate_openai(&api_key, &model, http_proxy.clone()).await;
    if !is_valid { return Err("Invalid OpenAI API Key or Model".into()) }

    let config = OpenAIConfig::new().with_api_key(api_key);
    let proxy_url = match http_proxy {
        Some(proxy) => {
            if proxy.is_empty() { env::var("HTTPS_PROXY").ok() } else { Some(proxy.clone()) }
        }
        None => env::var("HTTPS_PROXY").ok(),
    };


    let http_client = create_http_client(proxy_url);
    unsafe {
        OPENAI_CLIENT = Option::from(Client::with_config(config).with_http_client(http_client));
    }

    return Ok("OpenAI client created".to_string());
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
        .invoke_handler(tauri::generate_handler![greet,create_openai_client])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
