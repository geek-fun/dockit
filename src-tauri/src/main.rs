// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod common;
mod fetch_client;
mod menu;
mod openai_client;
mod dynamo_client;
mod dynamo;

use fetch_client::fetch_api;
use openai_client::{chat_stream, create_openai_client};
use dynamo_client::dynamo_api;

#[derive(Clone, serde::Serialize)]
struct AuthPayload {
    token: String,
    username: String,
    email: String,
}

fn parse_auth_from_url(url: &str) -> Option<AuthPayload> {
    let url = url::Url::parse(url).ok()?;
    if url.scheme() != "dockit" || url.host_str() != Some("auth") {
        return None;
    }
    // SECURITY: The token is passed as a URL query parameter (dockit://auth?token=...).
    // Query parameters may be recorded in OS URL handler logs and browser history.
    // Ensure the token is short-lived and single-use to limit exposure window.
    let params: std::collections::HashMap<_, _> = url.query_pairs().collect();
    let token = params.get("token")?.to_string();
    let username = params.get("username")?.to_string();
    let email = params.get("email")?.to_string();
    Some(AuthPayload { token, username, email })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_system_info::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            create_openai_client,
            fetch_api,
            chat_stream,
            dynamo_api,
        ])
        .setup(|app| {
            menu::create_menu(app)?;

            use tauri::{Emitter, Listener};

            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    for url in &urls {
                        if let Some(payload) = parse_auth_from_url(url) {
                            let _ = app_handle.emit("dockit://auth", payload.clone());
                        }
                    }
                }
            });

            use tauri_plugin_deep_link::DeepLinkExt;
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                let app_handle = app.handle().clone();
                for url in &urls {
                    if let Some(payload) = parse_auth_from_url(url.as_str()) {
                        let _ = app_handle.emit("dockit://auth", payload);
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
