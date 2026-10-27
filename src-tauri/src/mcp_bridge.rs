use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

use crate::ai_permissions::{
    load_permission_policy, read_permission_config, AiPolicy, AI_POLICY_LOCK,
};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Json;
use data_studio_agent::capabilities::registry;
use data_studio_agent::capabilities::types::Capability;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

// ---------------------------------------------------------------------------
// Managed state (Tauri)
// ---------------------------------------------------------------------------

pub struct McpServerHandle {
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    pub server_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl McpServerHandle {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
            server_task: Mutex::new(None),
        }
    }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default = "default_auto_start")]
    pub auto_start: bool,
    #[serde(default)]
    pub policy: AiPolicy,
}

fn default_auto_start() -> bool {
    true
}

impl McpConfig {
    pub fn load(app_data_dir: &Path) -> Self {
        let path = app_data_dir.join("mcp-config.json");
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str(&s) {
                Ok(cfg) => cfg,
                Err(e) => {
                    log::warn!(
                        "Failed to parse mcp-config.json (corrupt?): {}. Using defaults.",
                        e
                    );
                    McpConfig::default()
                }
            },
            Err(_) => McpConfig::default(),
        }
    }

    pub fn save(&self, app_data_dir: &Path) -> Result<(), String> {
        let path = app_data_dir.join("mcp-config.json");
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        let temporary = app_data_dir.join(format!("mcp-config-{}.tmp", uuid::Uuid::new_v4()));
        std::fs::write(&temporary, &json)
            .map_err(|e| format!("Failed to write MCP config: {e}"))?;
        std::fs::rename(&temporary, &path).map_err(|e| {
            let _ = std::fs::remove_file(&temporary);
            format!("Failed to save MCP config: {e}")
        })
    }
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            port: None,
            auto_start: true,
            policy: AiPolicy::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct InvokeRequest {
    name: String,
    args: Value,
    connection_id: Option<String>,
}

#[derive(Serialize)]
pub struct InvokeResponse {
    status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl InvokeResponse {
    fn ok(data: Value) -> Self {
        Self {
            status: 200,
            data: Some(data),
            message: None,
        }
    }

    fn error(status: u16, message: String) -> Self {
        Self {
            status,
            data: None,
            message: Some(message),
        }
    }
}

// ---------------------------------------------------------------------------
// Axum application state
// ---------------------------------------------------------------------------

struct BridgeState<R: Runtime> {
    handle: AppHandle<R>,
    app_name: &'static str,
    app_data_dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

fn tools_payload(policy: &AiPolicy) -> Value {
    let reg = registry::registry();
    let caps = reg.agent_tools();
    let notice = policy.policy_notice();

    let tools: Vec<Value> = caps
        .iter()
        .filter(|cap| policy.advertises(cap))
        .map(|cap| {
            // Neon-style policy notice: tells the client (LLM) which
            // capabilities are gated and how to lift the gate, without
            // exposing the gated tools themselves.
            let description = match &notice {
                Some(n) => format!("{}\n\n{}", cap.description, n),
                None => cap.description.to_string(),
            };
            json!({
                "name": cap.name,
                "description": description,
                "inputSchema": cap.input_schema,
                "metadata": to_metadata(cap),
            })
        })
        .collect();

    json!({
        "tools": tools,
    })
}

fn entitlement_denied_for(session_confirmed: bool, local_entitled: bool) -> bool {
    !(session_confirmed && local_entitled)
}

fn entitlement_denied<R: Runtime>(state: &BridgeState<R>) -> Option<String> {
    let entitlement: tauri::State<'_, crate::entitlement::EntitlementState> = state.handle.state();
    if entitlement_denied_for(
        entitlement.session_confirmed(),
        entitlement.local_entitled(),
    ) {
        return Some("MCP Server requires an active Ultimate subscription".to_string());
    }
    None
}

async fn handle_tools<R: Runtime>(State(state): State<Arc<BridgeState<R>>>) -> Response {
    if let Some(reason) = entitlement_denied(&state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "error_type": crate::entitlement::ENTITLEMENT_ERROR_TYPE,
                "message": reason,
            })),
        )
            .into_response();
    }
    let policy = match load_permission_policy(&state.handle) {
        Ok(policy) => policy,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"message": e})),
            )
                .into_response()
        }
    };
    let mut result = tools_payload(&policy);
    result["connections"] = filter_ai_connections(list_connections(), &policy);
    Json(result).into_response()
}

/// Gate a capability against the MCP permission policy.
/// /tools advertises connection-agnostically (None), so visibility reflects
/// the global mode + confirm_destructive gate, not per-connection overrides.
fn check_policy(
    cap: &Capability,
    policy: &AiPolicy,
    connection_id: Option<&str>,
) -> Result<(), String> {
    if policy.allows(cap.risk_level, connection_id) {
        return Ok(());
    }
    let risk = format!("{:?}", cap.risk_level).to_lowercase();
    // Actionable guidance so the agent can relay "how to enable" to the user
    let reason = policy
        .deny_reason(cap.risk_level, connection_id)
        .unwrap_or_else(|| "blocked by MCP policy".to_string());
    Err(format!(
        "Capability '{}' ({}) blocked by MCP policy: {}",
        cap.name, risk, reason
    ))
}

async fn handle_invoke<R: Runtime>(
    State(state): State<Arc<BridgeState<R>>>,
    Json(payload): Json<InvokeRequest>,
) -> Json<InvokeResponse> {
    if let Some(reason) = entitlement_denied(&state) {
        return Json(InvokeResponse::error(403, reason));
    }
    let policy = match load_permission_policy(&state.handle) {
        Ok(policy) => policy,
        Err(e) => return Json(InvokeResponse::error(500, e)),
    };
    Json(invoke_with_policy(&policy, payload).await)
}

// Split from handle_invoke so policy tests can run without a bridge.
async fn invoke_with_policy(policy: &AiPolicy, payload: InvokeRequest) -> InvokeResponse {
    if let (Some(envelope), Some(argument)) = (
        payload.connection_id.as_deref(),
        payload.args.get("connection_id").and_then(Value::as_str),
    ) {
        if envelope != argument {
            return InvokeResponse::error(400, "Conflicting connection identifiers".into());
        }
    }
    let payload = InvokeRequest {
        connection_id: payload.connection_id.or_else(|| {
            payload
                .args
                .get("connection_id")
                .and_then(Value::as_str)
                .map(str::to_owned)
        }),
        ..payload
    };

    let cap = match registry::registry().get(&payload.name) {
        Some(c) => c,
        None => return InvokeResponse::error(404, format!("Unknown capability: {}", payload.name)),
    };

    if let Err(msg) = if policy.permission_defaults.is_some() {
        policy
            .authorize(cap, &payload.args, payload.connection_id.as_deref(), None)
            .map(|_| ())
    } else {
        check_policy(cap, policy, payload.connection_id.as_deref())
    } {
        return InvokeResponse::error(403, crate::ai_permissions::display_denial(&msg));
    }

    // Connection resolution is handled server-side via the configured connection
    let config = payload
        .connection_id
        .as_ref()
        .map(|id| json!({"connectionId": id}))
        .unwrap_or(Value::Null);
    match crate::ai_permissions::invoke_ai(&payload.name, &payload.args, &config, None).await {
        Ok(data) => match serde_json::from_str::<Value>(&data) {
            Ok(parsed) => InvokeResponse::ok(parsed),
            Err(_) => InvokeResponse::ok(json!({"result": data})),
        },
        Err(data_studio_agent::tool_executor::ToolExecutionError::Denied(msg)) => {
            InvokeResponse::error(403, msg)
        }
        Err(error) => InvokeResponse::error(400, error.to_string()),
    }
}

fn health_payload(app_name: &str, version: &str, port: u16) -> Value {
    json!({
        "status": "ok",
        "app": app_name,
        "version": version,
        "port": port,
    })
}

async fn handle_health<R: Runtime>(State(state): State<Arc<BridgeState<R>>>) -> Json<Value> {
    Json(health_payload(
        state.app_name,
        &state.handle.package_info().version.to_string(),
        get_actual_port(&state.app_data_dir).unwrap_or(0),
    ))
}

// ---------------------------------------------------------------------------
// Bridge startup
// ---------------------------------------------------------------------------

fn get_default_port() -> u16 {
    9120
}

/// Read the actual port from the port file with liveness check.
/// If the port file exists but nothing is listening, deletes the stale file.
fn get_actual_port(app_data_dir: &Path) -> Option<u16> {
    let path = app_data_dir.join("mcp-port");
    let port = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())?;

    // Liveness test: try opening a TCP connection to the port
    let addr = std::net::SocketAddrV4::new(std::net::Ipv4Addr::LOCALHOST, port);
    if std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::V4(addr),
        std::time::Duration::from_millis(200),
    )
    .is_ok()
    {
        Some(port)
    } else {
        // Stale file — clean up and report not running
        let _ = std::fs::remove_file(&path);
        None
    }
}

async fn write_port_file(app_data_dir: &Path, port: u16) -> Result<(), String> {
    let path = app_data_dir.join("mcp-port");
    tokio::fs::create_dir_all(app_data_dir)
        .await
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    tokio::fs::write(&path, port.to_string())
        .await
        .map_err(|e| format!("Failed to write port file: {}", e))?;
    Ok(())
}

async fn remove_port_file(app_data_dir: &Path) {
    let path = app_data_dir.join("mcp-port");
    let _ = tokio::fs::remove_file(path).await;
}

/// Shut down the bridge if it's running.
/// Returns the JoinHandle for the old server task, if any, so the caller can
/// await its full completion (including port file cleanup) before starting a new one.
async fn send_shutdown<R: Runtime>(handle: &AppHandle<R>) -> Option<tokio::task::JoinHandle<()>> {
    let server_handle: tauri::State<'_, McpServerHandle> = handle.state();
    let old_tx = {
        let mut tx = server_handle.shutdown_tx.lock().unwrap();
        tx.take()
    };
    if let Some(sender) = old_tx {
        let _ = sender.send(());
    }
    let mut task = server_handle.server_task.lock().unwrap();
    task.take()
}

/// The bridge only runs for a session confirmed in this app run.
pub fn sync_with_entitlement<R: Runtime + 'static>(handle: &AppHandle<R>) {
    use tauri::Manager;

    let entitled = {
        let entitlement: tauri::State<'_, crate::entitlement::EntitlementState> = handle.state();
        entitlement.session_confirmed() && entitlement.local_entitled()
    };
    if entitled {
        auto_start_if_entitled(handle);
        return;
    }
    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        shutdown_if_running(&handle).await;
    });
}

fn auto_start_if_entitled<R: Runtime + 'static>(handle: &AppHandle<R>) {
    let Ok(app_data_dir) = handle.path().app_data_dir() else {
        return;
    };
    auto_start_from_dir(handle, app_data_dir);
}

fn auto_start_from_dir<R: Runtime + 'static>(handle: &AppHandle<R>, app_data_dir: PathBuf) {
    let config = McpConfig::load(&app_data_dir);
    if !config.auto_start {
        return;
    }
    {
        let entitlement: tauri::State<'_, crate::entitlement::EntitlementState> = handle.state();
        if !entitlement.session_confirmed() || !entitlement.local_entitled() {
            return;
        }
    }

    // Claiming the slot is what keeps concurrent triggers from double-starting.
    let shutdown_rx = {
        let server_handle: tauri::State<'_, McpServerHandle> = handle.state();
        let mut tx = server_handle.shutdown_tx.lock().unwrap();
        if tx.is_some() {
            return;
        }
        let (sender, receiver) = tokio::sync::oneshot::channel();
        *tx = Some(sender);
        receiver
    };

    let bridge_handle = handle.clone();
    let retry_handle = handle.clone();
    let preferred = config.port.unwrap_or(get_default_port());
    tauri::async_runtime::spawn(async move {
        if let Err(e) = start(bridge_handle, app_data_dir, preferred, shutdown_rx).await {
            log::error!("MCP bridge failed to start: {}", e);
            let _ = send_shutdown(&retry_handle).await;
        }
    });
}

async fn shutdown_if_running<R: Runtime>(handle: &AppHandle<R>) {
    if let Some(task) = send_shutdown(handle).await {
        let _ = task.await;
    }
}

pub async fn start<R: Runtime>(
    handle: AppHandle<R>,
    app_data_dir: PathBuf,
    preferred_port: u16,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<u16, String> {
    // Try preferred port first, fall back to random
    let port = match TcpListener::bind(format!("127.0.0.1:{}", preferred_port)).await {
        Ok(listener) => {
            let state = Arc::new(BridgeState {
                handle: handle.clone(),
                app_name: "dockit",
                app_data_dir: app_data_dir.clone(),
            });

            let app = axum::Router::new()
                .route("/tools", post(handle_tools::<R>))
                .route("/invoke", post(handle_invoke::<R>))
                .route("/health", get(handle_health::<R>))
                .with_state(state);

            // Write port file BEFORE spawning to avoid orphaned server on write failure
            write_port_file(&app_data_dir, preferred_port).await?;

            let data_dir = app_data_dir.clone();
            let join_handle = tokio::spawn(async move {
                log::info!("MCP bridge listening on 127.0.0.1:{}", preferred_port);
                axum::serve(listener, app)
                    .with_graceful_shutdown(async {
                        shutdown_rx.await.ok();
                        log::info!("MCP bridge shutting down");
                    })
                    .await
                    .ok();
                let _ = remove_port_file(&data_dir).await;
            });
            {
                let mcp_handle: tauri::State<'_, McpServerHandle> = handle.state();
                let mut task = mcp_handle.server_task.lock().unwrap();
                *task = Some(join_handle);
            }

            Ok(preferred_port)
        }
        Err(_) => {
            log::warn!(
                "MCP bridge port {} is in use, picking random port",
                preferred_port
            );
            let random_port =
                portpicker::pick_unused_port().ok_or("no port available on localhost")?;
            let listener = TcpListener::bind(format!("127.0.0.1:{}", random_port))
                .await
                .map_err(|e| format!("Failed to bind bridge: {}", e))?;

            let state = Arc::new(BridgeState {
                handle: handle.clone(),
                app_name: "dockit",
                app_data_dir: app_data_dir.clone(),
            });

            let app = axum::Router::new()
                .route("/tools", post(handle_tools::<R>))
                .route("/invoke", post(handle_invoke::<R>))
                .route("/health", get(handle_health::<R>))
                .with_state(state);

            write_port_file(&app_data_dir, random_port).await?;

            let data_dir = app_data_dir.clone();
            let join_handle = tokio::spawn(async move {
                log::info!("MCP bridge listening on 127.0.0.1:{}", random_port);
                axum::serve(listener, app)
                    .with_graceful_shutdown(async {
                        shutdown_rx.await.ok();
                        log::info!("MCP bridge shutting down");
                    })
                    .await
                    .ok();
                let _ = remove_port_file(&data_dir).await;
            });
            {
                let mcp_handle: tauri::State<'_, McpServerHandle> = handle.state();
                let mut task = mcp_handle.server_task.lock().unwrap();
                *task = Some(join_handle);
            }

            Ok(random_port)
        }
    };

    port
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn to_metadata(cap: &Capability) -> Value {
    json!({
        "riskLevel": cap.risk_level,
        "requiredPermission": cap.required_permission
    })
}

fn to_safe_connection_summary(connection: &Value) -> Value {
    json!({
        "id": connection.get("id"),
        "name": connection.get("name"),
        "type": connection.get("type"),
        // Credentials (password, apiKey, auth) must stay out of this whitelist.
        "prompt": connection.get("prompt").and_then(Value::as_str),
        // First discovery tool an agent should call for this connection type
        // to learn its objects before querying.
        "discover": json!(discover_tool_for(&type_str(connection))),
    })
}

fn list_connections() -> Value {
    let handle = match crate::APP_HANDLE.get() {
        Some(h) => h,
        None => return json!([]),
    };
    let store = match handle.store(".store.dat") {
        Ok(s) => s,
        Err(_) => return json!([]),
    };

    let connections = store.get("connections").unwrap_or(json!([]));
    let safe_list: Vec<Value> = connections
        .as_array()
        .map(|arr| arr.iter().map(to_safe_connection_summary).collect())
        .unwrap_or_default();

    json!(safe_list)
}

/// The NoSQL discovery entry point per connection type: list the top-level
/// objects first (indices, databases, or tables), then drill into structure.
fn discover_tool_for(conn_type: &str) -> &'static str {
    match conn_type.to_ascii_lowercase().as_str() {
        t if t.contains("elastic") || t.contains("open") => "es__cat_indices",
        t if t.contains("mongo") => "mongo__list_databases",
        t if t.contains("dynamo") => "dynamo__list_tables",
        _ => "dockit__list_connections",
    }
}

fn type_str(c: &serde_json::Value) -> String {
    c.get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_mcp_status(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;

    let config = read_permission_config(&app_data_dir)?;
    let running_port = get_actual_port(&app_data_dir);

    let status = json!({
        "running": running_port.is_some(),
        "port": running_port,
        "configuredPort": config.port,
        "autoStart": config.auto_start,
        "policy": serde_json::to_value(&config.policy).map_err(|e| e.to_string())?,
    });

    serde_json::to_string(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_mcp_config(
    port: Option<u16>,
    auto_start: bool,
    restart: Option<bool>,
    policy: Option<AiPolicy>,
    app: AppHandle,
) -> Result<String, String> {
    let entitlement: tauri::State<'_, crate::entitlement::EntitlementState> = app.state();
    crate::entitlement::ensure_local_ultimate(&entitlement, "MCP Server")?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .to_path_buf();
    save_mcp_config_in_dir(
        &app,
        port,
        auto_start,
        policy,
        &app_data_dir,
        restart.unwrap_or(false),
    )
    .await
}

async fn save_mcp_config_in_dir<R: Runtime>(
    app: &AppHandle<R>,
    port: Option<u16>,
    auto_start: bool,
    policy: Option<AiPolicy>,
    app_data_dir: &Path,
    restart: bool,
) -> Result<String, String> {
    let entitlement: tauri::State<'_, crate::entitlement::EntitlementState> = app.state();
    crate::entitlement::ensure_local_ultimate(&entitlement, "MCP Server")?;

    {
        let _guard = AI_POLICY_LOCK.lock().map_err(|e| e.to_string())?;
        // Load first so a None policy from older clients keeps the stored policy.
        let mut config = read_permission_config(app_data_dir)?;
        config.port = port;
        config.auto_start = auto_start;
        if let Some(p) = policy {
            config.policy = p;
        }
        config.save(app_data_dir)?;
    }

    // Always shut down the current server first and await its full exit
    // (including port file cleanup) to prevent the new server's port file
    // from being deleted by stale cleanup.
    let old_task = send_shutdown(app).await;
    if let Some(h) = old_task {
        let _ = h.await;
    }

    if auto_start || restart {
        if !entitlement.session_confirmed() {
            return Err(crate::entitlement::entitlement_required_error("MCP Server"));
        }
        let (new_shutdown_tx, new_shutdown_rx) = oneshot::channel();
        {
            let server_handle: tauri::State<'_, McpServerHandle> = app.state();
            let mut tx = server_handle.shutdown_tx.lock().unwrap();
            *tx = Some(new_shutdown_tx);
        }

        let preferred = port.unwrap_or(get_default_port());
        start(
            app.clone(),
            app_data_dir.to_path_buf(),
            preferred,
            new_shutdown_rx,
        )
        .await?;
    }

    Ok(serde_json::to_string(&json!({"status": "ok"})).map_err(|e| e.to_string())?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai_permissions::McpPermissionMode;
    use data_studio_agent::capabilities::types::RiskLevel;
    use std::net::TcpListener as StdTcpListener;
    use tauri::Manager;

    fn temp_data_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("dockit-mcp-test-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn init_registry_for_tests() {
        // OnceLock set-once: subsequent calls are no-ops, safe to call in every test
        data_studio_agent::capabilities::registry::init_registry(&[
            crate::capabilities::es::register_all,
            crate::capabilities::mongo::register_all,
            crate::capabilities::dynamo::register_all,
            crate::capabilities::dockit::register_all,
        ]);
    }

    #[test]
    fn test_mcp_config_default() {
        let cfg = McpConfig::default();
        assert_eq!(cfg.port, None);
        assert!(cfg.auto_start);
        assert_eq!(cfg.policy, AiPolicy::default());
    }

    #[test]
    fn test_requests_are_denied_unless_a_session_and_a_plan_are_both_present() {
        assert!(!entitlement_denied_for(true, true));
        assert!(entitlement_denied_for(true, false));
        assert!(entitlement_denied_for(false, true));
        assert!(entitlement_denied_for(false, false));
    }

    #[test]
    fn test_mcp_config_save_and_load_roundtrip() {
        let dir = temp_data_dir("config-roundtrip");
        let cfg = McpConfig {
            port: Some(9333),
            auto_start: false,
            policy: AiPolicy {
                mode: McpPermissionMode::DataReadWrite,
                confirm_destructive: false,
                ..AiPolicy::default()
            },
        };
        cfg.save(&dir).unwrap();

        let loaded = McpConfig::load(&dir);
        assert_eq!(loaded.port, Some(9333));
        assert!(!loaded.auto_start);
        assert_eq!(loaded.policy, cfg.policy);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_mcp_config_load_missing_file_uses_default() {
        let dir = temp_data_dir("config-missing");
        let cfg = McpConfig::load(&dir);
        assert_eq!(cfg.port, None);
        assert!(cfg.auto_start);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_mcp_config_load_corrupt_file_uses_default() {
        let dir = temp_data_dir("config-corrupt");
        std::fs::write(dir.join("mcp-config.json"), "{ not valid json").unwrap();
        let cfg = McpConfig::load(&dir);
        assert_eq!(cfg.port, None);
        assert!(cfg.auto_start);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_invoke_response_ok_serialization() {
        let resp = InvokeResponse::ok(json!({"hits": 1}));
        let v = serde_json::to_value(&resp).unwrap();
        assert_eq!(v["status"], 200);
        assert_eq!(v["data"]["hits"], 1);
        assert!(v.get("message").is_none());
    }

    #[test]
    fn test_invoke_response_error_serialization() {
        let resp = InvokeResponse::error(403, "forbidden".into());
        let v = serde_json::to_value(&resp).unwrap();
        assert_eq!(v["status"], 403);
        assert_eq!(v["message"], "forbidden");
        assert!(v.get("data").is_none());
    }

    #[test]
    fn test_get_actual_port_no_file() {
        let dir = temp_data_dir("port-none");
        assert_eq!(get_actual_port(&dir), None);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_get_actual_port_stale_file_is_removed() {
        let dir = temp_data_dir("port-stale");
        // Port 1 is reserved — nothing will be listening on it
        std::fs::write(dir.join("mcp-port"), "1").unwrap();
        assert_eq!(get_actual_port(&dir), None);
        assert!(
            !dir.join("mcp-port").exists(),
            "stale port file should be cleaned up"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_get_actual_port_live_port() {
        let dir = temp_data_dir("port-live");
        let listener = StdTcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::fs::write(dir.join("mcp-port"), port.to_string()).unwrap();

        assert_eq!(get_actual_port(&dir), Some(port));
        assert!(dir.join("mcp-port").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_write_and_remove_port_file() {
        let dir = temp_data_dir("port-write-remove");
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            write_port_file(&dir, 9120).await.unwrap();
            assert_eq!(
                std::fs::read_to_string(dir.join("mcp-port")).unwrap(),
                "9120"
            );

            remove_port_file(&dir).await;
            assert!(!dir.join("mcp-port").exists());
        });
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn test_default_port_is_9120() {
        assert_eq!(get_default_port(), 9120);
    }

    #[test]
    fn test_to_metadata_shape() {
        init_registry_for_tests();
        let reg = registry::registry();
        let caps = reg.agent_tools();
        assert!(!caps.is_empty(), "registry should have agent tools");
        let cap = &caps[0];

        let meta = to_metadata(cap);
        assert_eq!(
            meta["riskLevel"],
            serde_json::to_value(cap.risk_level).unwrap(),
            "riskLevel should use the lowercase serde name"
        );
        assert_eq!(meta["requiredPermission"], cap.required_permission);
    }

    #[test]
    fn test_tools_payload_contains_tools_and_metadata() {
        init_registry_for_tests();
        let v = tools_payload(&AiPolicy::default());
        let tools = v["tools"].as_array().unwrap();
        assert!(!tools.is_empty());
        for t in tools {
            assert!(t["name"].is_string());
            assert!(t["description"].is_string());
            assert!(t["inputSchema"].is_object());
            assert!(t["metadata"]["riskLevel"].is_string());
            assert!(t["metadata"]["requiredPermission"].is_string());
        }
    }

    #[test]
    fn test_tools_payload_filters_by_policy() {
        init_registry_for_tests();
        let reg = registry::registry();
        let caps = reg.agent_tools();
        if caps.iter().all(|c| matches!(c.risk_level, RiskLevel::Safe)) {
            return;
        }

        // ReadOnly default exposes only Safe capabilities
        let v = tools_payload(&AiPolicy::default());
        let names: std::collections::HashSet<&str> = v["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        for cap in caps.iter() {
            let exposed = names.contains(cap.name);
            assert_eq!(
                exposed,
                matches!(cap.risk_level, RiskLevel::Safe | RiskLevel::Elevated),
                "capability '{}' exposure should follow the DataReadWrite default policy",
                cap.name
            );
        }

        // FullAccess exposes every capability (confirm_destructive stays on)
        let full = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            ..AiPolicy::default()
        };
        let v_full = tools_payload(&full);
        assert_eq!(v_full["tools"].as_array().unwrap().len(), caps.len());
    }

    #[test]
    fn test_tools_payload_appends_policy_notice_when_gated() {
        init_registry_for_tests();
        // Default DataReadWrite gates Destructive → notice appended
        let v = tools_payload(&AiPolicy::default());
        let tools = v["tools"].as_array().unwrap();
        assert!(!tools.is_empty());
        for t in tools {
            let desc = t["description"].as_str().unwrap();
            assert!(
                desc.contains("MCP policy notice"),
                "surviving tool descriptions must carry the policy notice"
            );
            assert!(desc.contains("destructive operations"));
        }
        // FullAccess + confirm on → no gate → no notice
        let full = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            ..AiPolicy::default()
        };
        let v_full = tools_payload(&full);
        for t in v_full["tools"].as_array().unwrap() {
            let desc = t["description"].as_str().unwrap();
            assert!(!desc.contains("MCP policy notice"));
        }
    }

    #[test]
    fn test_list_connections_empty_without_app_handle() {
        assert_eq!(list_connections(), json!([]));
    }

    #[test]
    fn test_to_safe_connection_summary_exposes_prompt_only() {
        let conn = json!({
            "id": 42,
            "name": "prod-cluster",
            "type": "ELASTICSEARCH",
            "prompt": "Orders cluster. Field meanings: ...",
            "password": "super-secret",
            "apiKey": "sk-abc",
            "auth": { "uri": "mongodb://user:pass@host" },
        });
        let summary = to_safe_connection_summary(&conn);
        assert_eq!(summary["id"], 42);
        assert_eq!(summary["name"], "prod-cluster");
        assert_eq!(summary["type"], "ELASTICSEARCH");
        assert_eq!(summary["prompt"], "Orders cluster. Field meanings: ...");
        assert!(summary.get("password").is_none());
        assert!(summary.get("apiKey").is_none());
        assert!(summary.get("auth").is_none());
    }

    #[test]
    fn test_to_safe_connection_summary_prompt_absent_yields_null() {
        let conn = json!({
            "id": 7,
            "name": "no-prompt",
            "type": "MONGODB",
            "password": "secret",
        });
        let summary = to_safe_connection_summary(&conn);
        assert_eq!(summary["prompt"], Value::Null);
        assert!(summary.get("password").is_none());
    }

    #[test]
    fn test_health_payload_shape() {
        let v = health_payload("dockit", "1.2.3", 9120);
        assert_eq!(v["status"], "ok");
        assert_eq!(v["app"], "dockit");
        assert_eq!(v["version"], "1.2.3");
        assert_eq!(v["port"], 9120);
    }

    #[test]
    fn test_check_policy_allows_safe_by_default() {
        init_registry_for_tests();
        let cap = registry::registry().get("es__search").unwrap();
        assert!(check_policy(cap, &AiPolicy::default(), None).is_ok());
    }

    #[test]
    fn test_check_policy_blocks_destructive_by_default() {
        init_registry_for_tests();
        let caps = registry::registry().agent_tools();
        let Some(destructive) = caps
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Destructive))
        else {
            return;
        };
        // Default mode is DataReadWrite — Destructive must be blocked
        let err = check_policy(destructive, &AiPolicy::default(), None).unwrap_err();
        assert!(err.contains("blocked by MCP policy"));
        // Error carries actionable guidance for the agent to relay
        assert!(err.contains("requires FullAccess permission mode"));
    }

    #[test]
    fn test_check_policy_full_access_allows_destructive() {
        init_registry_for_tests();
        let caps = registry::registry().agent_tools();
        let Some(destructive) = caps
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Destructive))
        else {
            return;
        };
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            ..AiPolicy::default()
        };
        assert!(check_policy(destructive, &policy, None).is_ok());
    }

    #[test]
    fn test_check_policy_confirm_off_blocks_destructive_even_in_full_access() {
        init_registry_for_tests();
        let caps = registry::registry().agent_tools();
        let Some(destructive) = caps
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Destructive))
        else {
            return;
        };
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: false,
            ..AiPolicy::default()
        };
        assert!(check_policy(destructive, &policy, None).is_err());
    }

    #[test]
    fn test_check_policy_respects_connection_read_only_override() {
        init_registry_for_tests();
        let caps = registry::registry().agent_tools();
        let Some(elevated) = caps
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Elevated))
        else {
            return;
        };
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: std::collections::HashMap::from([(
                "prod".into(),
                crate::ai_permissions::ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            ..AiPolicy::default()
        };
        // Global mode allows Elevated, but the per-connection override blocks it
        assert!(check_policy(elevated, &policy, None).is_ok());
        assert!(check_policy(elevated, &policy, Some("prod")).is_err());
        assert!(check_policy(elevated, &policy, Some("staging")).is_ok());
    }

    #[test]
    fn test_handle_invoke_unknown_capability_returns_404() {
        init_registry_for_tests();
        let req = InvokeRequest {
            name: "definitely__not_a_real_capability".into(),
            args: json!({}),
            connection_id: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let resp = rt.block_on(invoke_with_policy(&AiPolicy::default(), req));

        assert_eq!(resp.status, 404);
        assert!(resp.message.unwrap().contains("Unknown capability"));
    }

    #[test]
    fn test_handle_invoke_rejects_elevated_and_destructive() {
        init_registry_for_tests();
        let tools = registry::registry().agent_tools();
        // Concurrent tests may initialize the global registry (OnceLock) with
        // Default (DataReadWrite) rejects Destructive, allows Elevated
        let Some(risky) = tools
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Destructive))
        else {
            return;
        };

        let req = InvokeRequest {
            name: risky.name.to_string(),
            args: json!({}),
            connection_id: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let resp = rt.block_on(invoke_with_policy(&AiPolicy::default(), req));

        assert_eq!(resp.status, 403);
        assert!(resp.message.unwrap().contains("blocked by MCP policy"));
    }

    #[test]
    fn test_handle_invoke_safe_capability_without_app_handle() {
        init_registry_for_tests();
        let tools = registry::registry().agent_tools();
        // Same OnceLock guard as above: skip when a concurrent test replaced the registry
        let has_risky = tools
            .iter()
            .any(|c| !matches!(c.risk_level, RiskLevel::Safe));
        if !has_risky {
            return;
        }
        let safe = tools
            .iter()
            .find(|c| matches!(c.risk_level, RiskLevel::Safe))
            .expect("registry should contain a safe capability");

        let req = InvokeRequest {
            name: safe.name.to_string(),
            args: json!({}),
            connection_id: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let resp = rt.block_on(invoke_with_policy(&AiPolicy::default(), req));

        // Safe capability passes the policy check; with no connection config the
        // capability itself fails, proving execution reached the invoke path.
        assert_eq!(resp.status, 400);
    }

    fn mock_app(
        state: crate::entitlement::EntitlementState,
    ) -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .plugin(tauri_plugin_store::Builder::default().build())
            .manage(state)
            .manage(McpServerHandle::new())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("mock app")
    }

    fn paid_state() -> crate::entitlement::EntitlementState {
        let state = crate::entitlement::EntitlementState::load(None);
        state.confirm_session();
        state.grant_active_plan_for_test();
        state
    }

    fn bridge_state(
        app: &tauri::App<tauri::test::MockRuntime>,
        dir: PathBuf,
    ) -> Arc<BridgeState<tauri::test::MockRuntime>> {
        Arc::new(BridgeState {
            handle: app.handle().clone(),
            app_name: "dockit",
            app_data_dir: dir,
        })
    }

    async fn tools_body(response: Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("tools body");
        serde_json::from_slice(&bytes).expect("tools json")
    }

    #[tokio::test]
    async fn tools_and_invoke_are_forbidden_until_a_session_and_a_plan_exist() {
        init_registry_for_tests();
        let dir = temp_data_dir("gate-denied");
        let cached = crate::entitlement::EntitlementState::load(None);
        cached.grant_active_plan_for_test();
        let app = mock_app(cached);
        let state = bridge_state(&app, dir.clone());

        let denied = handle_tools(State(state.clone())).await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let body = tools_body(denied).await;
        assert_eq!(
            body["error_type"],
            crate::entitlement::ENTITLEMENT_ERROR_TYPE
        );

        let Json(invoked) = handle_invoke(
            State(state),
            Json(InvokeRequest {
                name: "es__search".into(),
                args: json!({}),
                connection_id: None,
            }),
        )
        .await;
        assert_eq!(invoked.status, 403);
        assert!(invoked.message.unwrap().contains("Ultimate"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn tools_and_invoke_proceed_when_the_session_and_plan_are_both_live() {
        init_registry_for_tests();
        let dir = temp_data_dir("gate-open");
        let app = mock_app(paid_state());
        let state = bridge_state(&app, dir.clone());

        let ok = handle_tools(State(state.clone())).await;
        assert_eq!(ok.status(), StatusCode::OK);
        let body = tools_body(ok).await;
        assert!(body["tools"]
            .as_array()
            .is_some_and(|tools| !tools.is_empty()));
        assert_eq!(body["connections"], json!([]));

        let Json(invoked) = handle_invoke(
            State(state),
            Json(InvokeRequest {
                name: "definitely__not_a_real_capability".into(),
                args: json!({}),
                connection_id: None,
            }),
        )
        .await;
        assert_eq!(invoked.status, 404);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn the_bridge_stays_down_without_a_plan_and_stops_when_the_plan_is_gone() {
        let dir = temp_data_dir("bridge-lifecycle");
        let cached = crate::entitlement::EntitlementState::load(None);
        cached.grant_active_plan_for_test();
        let cached_app = mock_app(cached);
        McpConfig {
            port: Some(1),
            auto_start: true,
            ..McpConfig::default()
        }
        .save(&dir)
        .unwrap();
        auto_start_from_dir(cached_app.handle(), dir.clone());
        assert!(cached_app
            .state::<McpServerHandle>()
            .shutdown_tx
            .lock()
            .unwrap()
            .is_none());

        let idle = McpConfig {
            auto_start: false,
            ..McpConfig::default()
        };
        idle.save(&dir).unwrap();

        let app = mock_app(paid_state());
        auto_start_from_dir(app.handle(), dir.clone());
        let slot = app.state::<McpServerHandle>();
        assert!(slot.shutdown_tx.lock().unwrap().is_none());

        let port = portpicker::pick_unused_port().expect("free port");
        McpConfig {
            port: Some(port),
            auto_start: true,
            ..McpConfig::default()
        }
        .save(&dir)
        .unwrap();
        auto_start_from_dir(app.handle(), dir.clone());
        let started = wait_for_port_file(&dir).await;
        assert!(started, "bridge should bind once the plan is live");

        auto_start_from_dir(app.handle(), dir.clone());
        assert!(dir.join("mcp-port").exists());

        app.state::<crate::entitlement::EntitlementState>().clear();
        sync_with_entitlement(app.handle());
        let stopped = wait_for_port_file_gone(&dir).await;
        assert!(stopped, "logout must stop the bridge");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn saving_mcp_config_refuses_to_start_without_a_confirmed_session() {
        let dir = temp_data_dir("save-config");
        let plan_only = crate::entitlement::EntitlementState::load(None);
        plan_only.grant_active_plan_for_test();
        let app = mock_app(plan_only);
        let err = save_mcp_config_in_dir(app.handle(), Some(0), true, None, &dir, false)
            .await
            .expect_err("autostart without a session");
        assert!(err.contains(crate::entitlement::ENTITLEMENT_ERROR_TYPE));
        assert!(!dir.join("mcp-port").exists());

        let unsigned = mock_app(crate::entitlement::EntitlementState::load(None));
        let err = save_mcp_config_in_dir(unsigned.handle(), None, false, None, &dir, false)
            .await
            .expect_err("a free plan cannot save MCP config");
        assert!(err.contains(crate::entitlement::ENTITLEMENT_ERROR_TYPE));

        let app = mock_app(paid_state());
        let ok = save_mcp_config_in_dir(app.handle(), None, false, None, &dir, false)
            .await
            .expect("a live plan can store config without starting");
        assert!(ok.contains("ok"));
        let stored = McpConfig::load(&dir);
        assert!(!stored.auto_start);

        let port = portpicker::pick_unused_port().expect("free port");
        save_mcp_config_in_dir(app.handle(), Some(port), true, None, &dir, false)
            .await
            .expect("a live plan can start the bridge");
        assert!(wait_for_port_file(&dir).await);
        shutdown_if_running(app.handle()).await;
        assert!(wait_for_port_file_gone(&dir).await);

        let _ = std::fs::remove_dir_all(&dir);
    }

    async fn wait_for_port_file(dir: &Path) -> bool {
        for _ in 0..50 {
            if let Ok(raw) = std::fs::read_to_string(dir.join("mcp-port")) {
                if let Ok(port) = raw.trim().parse::<u16>() {
                    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
                    if std::net::TcpStream::connect_timeout(
                        &addr,
                        std::time::Duration::from_millis(50),
                    )
                    .is_ok()
                    {
                        return true;
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        false
    }

    async fn wait_for_port_file_gone(dir: &Path) -> bool {
        for _ in 0..50 {
            if !dir.join("mcp-port").exists() {
                return true;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        false
    }
    #[test]
    fn ai_permission_roundtrip_preserves_partial_decisions_and_service_settings() {
        use crate::ai_permissions::PermissionRules;
        let dir = std::env::temp_dir().join(format!("dockit-ai-chain-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut policy = AiPolicy {
            permission_defaults: Some(PermissionRules::explicit(true, false, false, false, false)),
            ..Default::default()
        };
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                update: Some(true),
                delete: Some(false),
                ..Default::default()
            },
        );
        let config = McpConfig {
            port: Some(9432),
            auto_start: false,
            policy: policy.clone(),
        };
        config.save(&dir).unwrap();
        let loaded = read_permission_config(&dir).unwrap();
        assert_eq!(loaded.policy, policy);
        assert_eq!(loaded.port, Some(9432));
        assert!(!loaded.auto_start);
        assert_eq!(loaded.policy.effective_permissions("42").update, Some(true));
        assert_eq!(
            loaded.policy.effective_permissions("42").delete,
            Some(false)
        );
        std::fs::write(dir.join("mcp-config.json"), "invalid").unwrap();
        assert!(read_permission_config(&dir).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn ai_connection_discovery_filters_numeric_and_string_ids_by_effective_permissions() {
        use crate::ai_permissions::PermissionRules;
        let mut policy = AiPolicy {
            permission_defaults: Some(PermissionRules::explicit(false, false, false, false, false)),
            ..Default::default()
        };
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                read: Some(true),
                ..Default::default()
            },
        );
        let filtered =
            filter_ai_connections(json!([{"id":42},{"id":"other"},{"id":null}]), &policy);
        assert_eq!(filtered, json!([{"id":42}]));
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                read: Some(false),
                ..Default::default()
            },
        );
        assert_eq!(filter_ai_connections(filtered, &policy), json!([]));
    }
}

fn filter_ai_connections(connections: Value, policy: &AiPolicy) -> Value {
    json!(connections
        .as_array()
        .into_iter()
        .flatten()
        .filter(|connection| {
            let id = match &connection["id"] {
                Value::String(id) => id.clone(),
                Value::Number(id) => id.to_string(),
                _ => return false,
            };
            policy.effective_permissions(&id).any_allowed()
        })
        .cloned()
        .collect::<Vec<_>>())
}
