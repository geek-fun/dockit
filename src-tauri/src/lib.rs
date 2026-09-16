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
pub mod device_activation;
pub mod device_identity;
pub mod dynamo;
pub mod dynamo_client;
pub mod entitlement;
pub mod fetch_client;
pub mod file_api;
pub mod mcp_bridge;
pub mod menu;
pub mod mongo_client;
pub mod session;
pub mod ssh;

use agent::executor::DocKitToolExecutor;
use agent::query_history::{
    add_query_history_entry, clear_query_history, delete_query_history_entry, load_query_history,
    toggle_query_history_star,
};
use agent::session_store::{
    clear_agent_session_messages, clear_session_confirmation_rules, create_agent_session,
    delete_agent_session, delete_attached_source, delete_confirmation_rule, export_agent_session,
    import_agent_session, load_agent_sessions, load_attached_sources, load_confirmation_rules,
    load_session_messages, migrate_session_metadata, save_attached_source, save_confirmation_rule,
    update_session_meta, update_session_status,
};
use agent_adapters::{
    cancel_agent_loop, compact_agent_session, confirm_tool_call, get_agent_context_usage,
    get_all_tools, get_tool_full_result, list_llm_models, run_agent_loop, run_agent_step,
    validate_llm_config,
};
use capabilities::commands::{get_available_tools, invoke_capability};
use data_studio_agent as lib;
use data_studio_agent::storage;
use dynamo_client::{
    aws_assume_role, aws_list_profiles, aws_list_profiles_with_roles, aws_sso_get_role_credentials,
    aws_sso_list_accounts, aws_sso_list_roles, aws_sso_poll_token, aws_sso_start_device_auth,
    dynamo_test_connection,
};
use fetch_client::fetch_api;
use file_api::{get_file_info, read_file_batch};
use mongo_client::{
    mongo_execute_query, mongo_export_documents, mongo_import_documents, mongo_test_connection,
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

/// Deep links that arrive before the frontend has mounted cannot be delivered
/// via events (Tauri events are not queued) — they are parked here and the
/// frontend pulls them via `consume_pending_auth` once its listeners are up.
#[derive(Default)]
struct PendingAuthState(std::sync::Mutex<Option<AuthPayload>>);

impl PendingAuthState {
    fn store(&self, payload: AuthPayload) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(payload);
    }

    /// Take-and-clear so a delivered token can never be replayed.
    fn consume(&self) -> Option<AuthPayload> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).take()
    }
}

#[tauri::command]
fn consume_pending_auth(state: tauri::State<'_, PendingAuthState>) -> Option<AuthPayload> {
    state.consume()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_system_info::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Forward argv through the deep-link plugin: it filters for the
            // configured schemes and emits `deep-link://new-url` on the
            // running instance (the only path that works on Linux/Windows).
            use tauri_plugin_deep_link::DeepLinkExt;
            app.deep_link().handle_cli_arguments(args.iter());
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
            dynamo_test_connection,
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
            crate::ssh::commands::list_ssh_profiles,
            crate::ssh::commands::save_ssh_profile,
            crate::ssh::commands::delete_ssh_profile,
            crate::ssh::commands::test_ssh_connection,
            crate::ssh::commands::list_ssh_config_hosts,
            crate::common::http_client::detect_system_proxy,
            crate::consume_pending_auth,
            crate::entitlement::refresh_entitlement,
            crate::entitlement::get_entitlement,
            crate::entitlement::clear_entitlement,
            crate::device_activation::activate_device,
            crate::mcp_bridge::get_mcp_status,
            crate::mcp_bridge::save_mcp_config,
        ])
        .setup(|app| {
            menu::create_menu(app)?;

            use tauri::Manager;
            // Store AppHandle globally so capability handlers can access the store
            let _ = APP_HANDLE.set(app.handle().clone());
            // Initialize the capability registry
            data_studio_agent::capabilities::registry::init_registry(&[
                crate::capabilities::es::register_all,
                crate::capabilities::mongo::register_all,
                crate::capabilities::dynamo::register_all,
                crate::capabilities::dockit::register_all,
            ]);

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            let entitlement_state = crate::entitlement::EntitlementState::load(Some(
                app_data_dir.join("entitlement-cache.json"),
            ));
            app.manage(entitlement_state);
            app.manage(crate::device_activation::DeviceIdentityState::load(
                app_data_dir.clone(),
            ));
            app.manage(crate::session::SessionState::default());
            let db_path = app_data_dir.join("agent.sqlite");
            let agent_db = storage::db::open(&db_path)?;
            storage::db::migrate(&agent_db)?;
            db::ensure_query_history(&agent_db)?;
            {
                let conn = agent_db.0.lock().map_err(|e| e.to_string())?;
                storage::db::recover_stuck_sessions(&conn)?;
            }
            app.manage(agent_db);
            app.manage(crate::ssh::TunnelManager::new());
            app.manage(crate::mcp_bridge::McpServerHandle::new());

            use std::collections::HashMap;
            use std::sync::{Arc, Mutex};
            let confirm_map: lib::traits::ConfirmMap = Arc::new(Mutex::new(HashMap::new()));
            let cancel_map: lib::traits::CancelMap = Arc::new(Mutex::new(HashMap::new()));
            app.manage(confirm_map);
            app.manage(cancel_map);
            let executor: Arc<dyn lib::ToolExecutor> = Arc::new(DocKitToolExecutor);
            app.manage(executor);

            {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| format!("{}", e))?
                    .to_path_buf();
                let config = crate::mcp_bridge::McpConfig::load(&app_data_dir);
                let mcp_entitled = app
                    .state::<crate::entitlement::EntitlementState>()
                    .local_entitled();
                if config.auto_start && mcp_entitled {
                    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
                    let server_handle: tauri::State<'_, crate::mcp_bridge::McpServerHandle> =
                        app.state();
                    {
                        let mut tx = server_handle.shutdown_tx.lock().unwrap();
                        *tx = Some(shutdown_tx);
                    }
                    let bridge_handle = app.handle().clone();
                    let data_dir = app_data_dir.clone();
                    let preferred = config.port.unwrap_or(9120);
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = crate::mcp_bridge::start(
                            bridge_handle,
                            data_dir,
                            preferred,
                            shutdown_rx,
                        )
                        .await
                        {
                            log::error!("MCP bridge failed to start: {}", e);
                        }
                    });
                }
            }

            use tauri::{Emitter, Listener};

            app.manage(PendingAuthState::default());

            // Handle deep links received while the app is already running.
            // Double-write: the event reaches a loaded frontend, the pending
            // slot covers the window before its listeners exist.
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event: tauri::Event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    for url in &urls {
                        if let Some(payload) = parse_auth_from_url(url) {
                            app_handle.state::<PendingAuthState>().store(payload.clone());
                            let _ = app_handle.emit("dockit://auth", payload);
                        }
                    }
                }
            });

            // Cold start: the URL arrived via argv before any frontend
            // listener could exist — park it for the pull above.
            use tauri_plugin_deep_link::DeepLinkExt;
            let pending = app.state::<PendingAuthState>();
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in &urls {
                    if let Some(payload) = parse_auth_from_url(url.as_str()) {
                        pending.store(payload);
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
