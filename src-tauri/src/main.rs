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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_system_info::init())
        .invoke_handler(tauri::generate_handler![
            create_openai_client,
            fetch_api,
            chat_stream,
            dynamo_api,
        ])
        .setup(|app| {
            menu::create_menu(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
