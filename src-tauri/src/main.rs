// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod common;
mod db;
mod fetch_client;
mod file_api;
mod menu;
mod dynamo_client;
mod dynamo;
mod mongo_client;

use tauri::Emitter;
use agent::{
    get_available_tools, introspect_schema, list_llm_models, run_agent_step,
    validate_llm_config,
};
use agent::executor::DocKitToolExecutor;
use agent::loop_runner::{
    cancel_agent_loop, confirm_tool_call, get_tool_full_result, run_agent_loop, CancelMap,
    ConfirmMap,
};
use agent::tool_executor::ToolExecutor;
use agent::session_store::{
    clear_agent_session_messages, create_agent_session, delete_agent_session,
    export_agent_session, import_agent_session, load_agent_sessions, load_session_messages,
    recover_stuck_sessions, update_session_status,
};
use fetch_client::fetch_api;
use file_api::{get_file_info, read_file_batch, stream_file_lines};
use dynamo_client::{
    aws_assume_role, aws_list_profiles, aws_list_profiles_with_roles, aws_sso_get_role_credentials,
    aws_sso_list_accounts, aws_sso_list_roles, aws_sso_poll_token, aws_sso_start_device_auth,
    dynamo_api,
};
use mongo_client::{
    mongo_collection_stats, mongo_create_collection, mongo_create_database, mongo_database_stats,
    mongo_drop_collection, mongo_drop_database, mongo_execute_query, mongo_list_collections,
    mongo_list_databases, mongo_test_connection, mongo_server_status, mongo_repl_set_status,
    mongo_shard_status,
};

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
            aws_list_profiles,
            aws_assume_role,
            aws_sso_start_device_auth,
            aws_sso_poll_token,
            aws_sso_get_role_credentials,
            aws_sso_list_accounts,
            aws_sso_list_roles,
            aws_list_profiles_with_roles,
            get_file_info,
            read_file_batch,
            stream_file_lines,
            mongo_test_connection,
            mongo_execute_query,
            mongo_list_databases,
            mongo_list_collections,
            mongo_collection_stats,
            mongo_database_stats,
            mongo_create_database,
            mongo_drop_database,
            mongo_create_collection,
            mongo_drop_collection,
            mongo_server_status,
            mongo_repl_set_status,
            mongo_shard_status,
            run_agent_step,
            validate_llm_config,
            list_llm_models,
            introspect_schema,
            get_available_tools,
            run_agent_loop,
            cancel_agent_loop,
            confirm_tool_call,
            get_tool_full_result,
            load_agent_sessions,
            create_agent_session,
            update_session_status,
            delete_agent_session,
            clear_agent_session_messages,
            load_session_messages,
            export_agent_session,
            import_agent_session,
        ])
        .setup(|app| {
            menu::create_menu(app)?;

            use tauri::Manager;
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            let db_path = app_data_dir.join("agent.sqlite");
            let agent_db = db::open(&db_path)?;
            db::migrate(&agent_db)?;
            {
                let conn = agent_db.0.lock().map_err(|e| e.to_string())?;
                recover_stuck_sessions(&conn)?;
            }
            app.manage(agent_db);

            use std::collections::HashMap;
            use std::sync::{Arc, Mutex};
            let confirm_map: ConfirmMap = Arc::new(Mutex::new(HashMap::new()));
            let cancel_map: CancelMap = Arc::new(Mutex::new(HashMap::new()));
            app.manage(confirm_map);
            app.manage(cancel_map);
            let executor: Arc<dyn ToolExecutor> = Arc::new(DocKitToolExecutor);
            app.manage(executor);

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
