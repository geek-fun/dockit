//! Tauri command adapters for data-studio-agent-lib.
//!
//! Thin `#[tauri::command]` wrappers that extract Tauri state,
//! create concrete EventEmitter + SessionStore impls, and delegate
//! to the shared library.

use std::collections::HashMap;

use data_studio_agent as lib;
use data_studio_agent::storage;
use data_studio_agent::traits::{CancelMap, ConfirmMap, EventEmitter};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

// ---------------------------------------------------------------------------
// TauriEventEmitter — bridges Tauri's Emitter into the lib's EventEmitter trait
// ---------------------------------------------------------------------------

struct TauriEmitter(AppHandle);

impl EventEmitter for TauriEmitter {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit(event, payload);
    }
}

// ---------------------------------------------------------------------------
// Agent loop commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn run_agent_loop(
    session_id: String,
    user_message: String,
    settings: Value,
    app: AppHandle,
) -> Result<(), String> {
    crate::entitlement::ensure_local_ultimate(
        &app.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    let db_state: State<storage::db::AgentDb> = app.state::<storage::db::AgentDb>();
    let store = storage::session_store::SqliteSessionStore::new(db_state.inner().clone());
    let emitter = TauriEmitter(app.clone());

    let confirm_state: State<ConfirmMap> = app.state::<ConfirmMap>();
    let confirm_map: ConfirmMap = confirm_state.inner().clone();
    let cancel_state: State<CancelMap> = app.state::<CancelMap>();
    let cancel_map: CancelMap = cancel_state.inner().clone();

    let connections: HashMap<String, Value> = settings
        .get("connections")
        .map(|value| serde_json::from_value(value.clone()))
        .transpose()
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let connections: HashMap<String, Value> = connections
        .into_iter()
        .flat_map(|(alias, config)| {
            let id = config
                .get("connectionId")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let mut entries = vec![(alias, config.clone())];
            if let Some(id) = id {
                entries.push((id, config));
            }
            entries
        })
        .collect();
    let fallback = settings
        .get("connectionConfig")
        .cloned()
        .unwrap_or(Value::Null);

    let studio = match settings.get("contextKind").and_then(Value::as_str) {
        Some("dataStudio") => true,
        Some("sidebarAssistant") => false,
        _ => return Err("Unknown AI context".into()),
    };
    let executor = crate::agent::executor::DocKitToolExecutor {
        access: crate::ai_permissions::AgentAccess {
            session_id: session_id.clone(),
            connections: connections.clone(),
            studio,
            db: db_state.inner().clone(),
        },
    };

    let is_parallel_ok = |name: &str| -> bool {
        data_studio_agent::capabilities::registry::registry()
            .get(name)
            .map(|c| c.parallel_ok)
            .unwrap_or(false)
    };

    // The executor owns authorization before confirmation and again before execution.
    let legacy_deny_hook = |_: &str, _: Option<&str>| false;

    lib::loop_runner::run_agent_loop(
        &session_id,
        &user_message,
        &settings,
        &store,
        &emitter,
        &executor,
        connections,
        fallback,
        &confirm_map,
        &cancel_map,
        &is_parallel_ok,
        &legacy_deny_hook,
    )
    .await
}

#[tauri::command]
pub async fn cancel_agent_loop(
    session_id: String,
    cancel_map: State<'_, CancelMap>,
) -> Result<(), String> {
    lib::loop_runner::cancel_agent_loop(&session_id, &cancel_map)
}

#[tauri::command]
pub async fn confirm_tool_call(
    tool_call_id: String,
    allowed: bool,
    confirm_map: State<'_, ConfirmMap>,
) -> Result<(), String> {
    lib::loop_runner::confirm_tool_call(&tool_call_id, allowed, &confirm_map)
}

#[tauri::command]
pub async fn get_tool_full_result(
    tool_call_id: String,
    db: State<'_, storage::db::AgentDb>,
) -> Result<String, String> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT full_result FROM tool_result_store WHERE tool_call_id = ?1 ORDER BY created_at DESC LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        let result: Result<String, rusqlite::Error> =
            stmt.query_row(rusqlite::params![tool_call_id], |row| row.get(0));
        result.map_err(|e| format!("Tool result not found: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn compact_agent_session(
    session_id: String,
    settings: Value,
    app: AppHandle,
) -> Result<Value, String> {
    crate::entitlement::ensure_local_ultimate(
        &app.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    let db_state: State<storage::db::AgentDb> = app.state::<storage::db::AgentDb>();
    let store = storage::session_store::SqliteSessionStore::new(db_state.inner().clone());
    let emitter = TauriEmitter(app.clone());
    lib::loop_runner::compact_agent_session(&session_id, &settings, &store, &emitter).await
}

#[tauri::command]
pub async fn get_agent_context_usage(
    session_id: String,
    settings: Value,
    app: AppHandle,
) -> Result<Value, String> {
    let db_state: State<storage::db::AgentDb> = app.state::<storage::db::AgentDb>();
    let store = storage::session_store::SqliteSessionStore::new(db_state.inner().clone());
    lib::loop_runner::get_agent_context_usage(&session_id, &settings, &store).await
}

// ---------------------------------------------------------------------------
// Harness commands (single-step LLM call + validation)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn run_agent_step(
    window: tauri::Window,
    request_id: String,
    provider: String,
    model: String,
    messages: Vec<Value>,
    tools: Vec<Value>,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    api_key: String,
    base_url: Option<String>,
) -> Result<String, String> {
    use tauri::Manager;
    crate::entitlement::ensure_local_ultimate(
        &window.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    let result = lib::harness::run_agent_step(
        provider, model, messages, tools, http_proxy, proxy_mode, api_key, base_url,
    )
    .await?;

    // Emit streaming events via window (same as old behavior)
    let _ = window.emit("agent-step-done", 
        serde_json::json!({"requestId": request_id, "finishReason": result.get("finishReason").and_then(|v| v.as_str()).unwrap_or("stop")}).to_string()
    );
    Ok(result.to_string())
}

#[tauri::command]
pub async fn validate_llm_config(
    app: AppHandle,
    provider: String,
    api_key: String,
    model: String,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    base_url: Option<String>,
) -> Result<bool, String> {
    crate::entitlement::ensure_local_ultimate(
        &app.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    lib::harness::validate_llm_config(provider, api_key, model, http_proxy, proxy_mode, base_url)
        .await
}

#[tauri::command]
pub async fn list_llm_models(
    app: AppHandle,
    provider: String,
    api_key: String,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    crate::entitlement::ensure_local_ultimate(
        &app.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    lib::harness::list_llm_models(provider, api_key, http_proxy, proxy_mode, base_url).await
}

// ---------------------------------------------------------------------------
// Tools command
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_all_tools() -> Result<String, String> {
    lib::tools::get_all_tools()
}
