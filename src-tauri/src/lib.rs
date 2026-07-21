use std::sync::OnceLock;
use tauri::AppHandle;

/// Global AppHandle, set once during app setup. Allows capability handlers
/// and other background code to access the Tauri application handle without
/// threading it through every function signature.
pub static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub mod agent;
pub mod agent_adapters;
pub mod capabilities;
pub mod common;
pub mod db;
pub mod dynamo;
pub mod dynamo_client;
pub mod fetch_client;
pub mod file_api;
pub mod menu;
pub mod mongo_client;

use agent::executor::DocKitToolExecutor;
use agent::query_history::{
    add_query_history_entry, clear_query_history, delete_query_history_entry,
    load_query_history, toggle_query_history_star,
};
use agent::session_store::{
    clear_agent_session_messages, clear_session_confirmation_rules, create_agent_session,
    delete_agent_session, delete_attached_source, delete_confirmation_rule, export_agent_session,
    import_agent_session, load_agent_sessions, load_attached_sources, load_confirmation_rules,
    load_session_messages, migrate_session_metadata,
    save_attached_source, save_confirmation_rule, update_session_meta, update_session_status,
};
use agent_adapters::{
    cancel_agent_loop, compact_agent_session, confirm_tool_call, get_agent_context_usage,
    get_all_tools, get_tool_full_result, list_llm_models, run_agent_loop, run_agent_step,
    validate_llm_config,
};
use capabilities::commands::{get_available_tools, invoke_capability};
use data_studio_agent as lib;
use data_studio_agent::storage as storage;
use dynamo_client::{
    aws_assume_role, aws_list_profiles, aws_list_profiles_with_roles, aws_sso_get_role_credentials,
    aws_sso_list_accounts, aws_sso_list_roles, aws_sso_poll_token, aws_sso_start_device_auth,
};
use fetch_client::fetch_api;
use file_api::{get_file_info, read_file_batch};
use mongo_client::{
    mongo_execute_query, mongo_test_connection,
    mongo_export_documents,
    mongo_import_documents,
};
use tauri::Emitter;

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
    Some(AuthPayload {
        token,
        user_id,
        username,
        email,
        avatar,
    })
}

pub fn run() {
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
            invoke_capability,
            get_available_tools,
            fetch_api,
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
            mongo_test_connection,
            mongo_execute_query,
            mongo_export_documents,
            mongo_import_documents,
            run_agent_step,
            validate_llm_config,
            list_llm_models,
            get_all_tools,
            run_agent_loop,
            cancel_agent_loop,
            compact_agent_session,
            get_agent_context_usage,
            confirm_tool_call,
            get_tool_full_result,
            load_agent_sessions,
            create_agent_session,
            update_session_status,
            update_session_meta,
            delete_agent_session,
            clear_agent_session_messages,
            load_session_messages,
            export_agent_session,
            import_agent_session,
            load_confirmation_rules,
            save_confirmation_rule,
            delete_confirmation_rule,
            clear_session_confirmation_rules,
            load_attached_sources,
            save_attached_source,
            delete_attached_source,
            migrate_session_metadata,
            load_query_history,
            add_query_history_entry,
            toggle_query_history_star,
            delete_query_history_entry,
            clear_query_history,
        ])
        .setup(|app| {
            menu::create_menu(app)?;

            use tauri::Manager;
            // Store AppHandle globally so capability handlers can access the store
            let _ = APP_HANDLE.set(app.handle().clone());
            // Initialize the capability registry
            capabilities::registry::init_registry();

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            let db_path = app_data_dir.join("agent.sqlite");
            let agent_db = storage::db::open(&db_path)?;
            storage::db::migrate(&agent_db)?;
            db::ensure_query_history(&agent_db)?;
            {
                let conn = agent_db.0.lock().map_err(|e| e.to_string())?;
                storage::db::recover_stuck_sessions(&conn)?;
            }
            app.manage(agent_db);

            use std::collections::HashMap;
            use std::sync::{Arc, Mutex};
            let confirm_map: lib::traits::ConfirmMap = Arc::new(Mutex::new(HashMap::new()));
            let cancel_map: lib::traits::CancelMap = Arc::new(Mutex::new(HashMap::new()));
            app.manage(confirm_map);
            app.manage(cancel_map);
            let executor: Arc<dyn lib::ToolExecutor> = Arc::new(DocKitToolExecutor);
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

// Integration tests — included as a crate module to avoid separate
// binary linking issues on Windows (exit code 127 from cargo test --test).
#[cfg(test)]
mod tests;
