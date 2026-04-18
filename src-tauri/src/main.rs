// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod common;
mod fetch_client;
mod file_api;
mod menu;
mod dynamo_client;
mod dynamo;

use tauri::Emitter;
use agent::{execute_tool, get_available_tools, introspect_schema, run_agent_step, validate_llm_config};
use fetch_client::fetch_api;
use file_api::{get_file_info, read_file_batch, stream_file_lines};
use dynamo_client::dynamo_api;

#[derive(Clone, serde::Serialize)]
struct AuthPayload {
    token: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    username: Option<String>,
    email: Option<String>,
    avatar: Option<String>,
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
    let user_id = params.get("userId").map(|v| v.to_string());
    let username = params.get("username").map(|v| v.to_string());
    let email = params.get("email").map(|v| v.to_string());
    let avatar = params.get("avatar").map(|v| v.to_string());
    Some(AuthPayload { token, user_id, username, email, avatar })
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.len() > 1 {
                let deep_link = &args[1];
                let _ = app.emit("deep-link-received", deep_link);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            fetch_api,
            dynamo_api,
            get_file_info,
            read_file_batch,
            stream_file_lines,
            run_agent_step,
            validate_llm_config,
            execute_tool,
            introspect_schema,
            get_available_tools,
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
