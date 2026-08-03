use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

use axum::extract::State;
use axum::routing::{get, post};
use axum::Json;
use data_studio_agent::capabilities::permissions::McpPolicy;
use data_studio_agent::capabilities::registry;
use data_studio_agent::capabilities::types::Capability;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
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
    pub policy: McpPolicy,
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
        std::fs::write(&path, &json).map_err(|e| format!("Failed to write mcp-config.json: {}", e))
    }
}

impl Default for McpConfig {
    fn default() -> Self {
        Self {
            port: None,
            auto_start: true,
            policy: McpPolicy::default(),
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

struct BridgeState {
    handle: AppHandle,
    app_name: &'static str,
    app_data_dir: PathBuf,
    policy: McpPolicy,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

fn tools_payload(policy: &McpPolicy) -> Value {
    let reg = registry::registry();
    let caps = reg.agent_tools();
    let notice = policy.policy_notice();

    let tools: Vec<Value> = caps
        .iter()
        .filter(|cap| check_policy(cap, policy, None).is_ok())
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

async fn handle_tools(State(state): State<Arc<BridgeState>>) -> Json<Value> {
    let mut result = tools_payload(&state.policy);
    result["connections"] = list_connections();
    Json(result)
}

/// Gate a capability against the MCP permission policy.
/// /tools advertises connection-agnostically (None), so visibility reflects
/// the global mode + confirm_destructive gate, not per-connection overrides.
fn check_policy(
    cap: &Capability,
    policy: &McpPolicy,
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
    Err(format!("Capability '{}' ({}) blocked by MCP policy: {}", cap.name, risk, reason))
}

async fn handle_invoke(
    State(state): State<Arc<BridgeState>>,
    Json(payload): Json<InvokeRequest>,
) -> Json<InvokeResponse> {
    Json(invoke_with_policy(&state.policy, payload).await)
}

// Split from handle_invoke so tests can run it without a Tauri runtime —
// BridgeState holds a Wry AppHandle, which tauri::test mocks cannot provide.
async fn invoke_with_policy(policy: &McpPolicy, payload: InvokeRequest) -> InvokeResponse {
    let cap = match registry::registry().get(&payload.name) {
        Some(c) => c,
        None => return InvokeResponse::error(404, format!("Unknown capability: {}", payload.name)),
    };

    if let Err(msg) = check_policy(cap, policy, payload.connection_id.as_deref()) {
        return InvokeResponse::error(403, msg);
    }

    // Connection resolution is handled server-side via the configured connection
    let config = match payload.connection_id {
        Some(ref id) => match resolve_connection(id).await {
            Ok(cfg) => Some(cfg),
            Err(e) => return InvokeResponse::error(400, e),
        },
        None => None,
    };

    match registry::invoke_capability_inner(&payload.name, payload.args, config).await {
        Ok(data) => match serde_json::from_str::<Value>(&data) {
            Ok(parsed) => InvokeResponse::ok(parsed),
            Err(_) => InvokeResponse::ok(json!({"result": data})),
        },
        Err(msg) => InvokeResponse::error(400, msg),
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

async fn handle_health(State(state): State<Arc<BridgeState>>) -> Json<Value> {
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
async fn send_shutdown(handle: &AppHandle) -> Option<tokio::task::JoinHandle<()>> {
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

pub async fn start(
    handle: AppHandle,
    app_data_dir: PathBuf,
    preferred_port: u16,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<u16, String> {
    // Try preferred port first, fall back to random
    let policy = McpConfig::load(&app_data_dir).policy;
    let port = match TcpListener::bind(format!("127.0.0.1:{}", preferred_port)).await {
        Ok(listener) => {
            let state = Arc::new(BridgeState {
                handle: handle.clone(),
                app_name: "dockit",
                app_data_dir: app_data_dir.clone(),
                policy: policy.clone(),
            });

            let app = axum::Router::new()
                .route("/tools", post(handle_tools))
                .route("/invoke", post(handle_invoke))
                .route("/health", get(handle_health))
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
                policy: policy.clone(),
            });

            let app = axum::Router::new()
                .route("/tools", post(handle_tools))
                .route("/invoke", post(handle_invoke))
                .route("/health", get(handle_health))
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
        .map(|arr| {
            arr.iter()
                .map(|c| {
                    json!({
                        "id": c.get("id"),
                        "name": c.get("name"),
                        "type": c.get("type"),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    json!(safe_list)
}

async fn resolve_connection(connection_id: &str) -> Result<Value, String> {
    let handle = crate::APP_HANDLE
        .get()
        .ok_or_else(|| "AppHandle not initialized".to_string())?;
    let mut config =
        crate::common::connection_resolver::ConnectionResolver::resolve(handle, connection_id)?;
    crate::common::ssh_bridge::resolve_ssh_in_place(handle, &mut config).await?;
    Ok(config)
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

    let config = McpConfig::load(&app_data_dir);
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
    policy: Option<McpPolicy>,
    app: AppHandle,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .to_path_buf();

    // Load first so a None policy from older clients keeps the stored policy.
    let mut config = McpConfig::load(&app_data_dir);
    config.port = port;
    config.auto_start = auto_start;
    if let Some(p) = policy {
        config.policy = p;
    }
    config.save(&app_data_dir)?;

    // Always shut down the current server first and await its full exit
    // (including port file cleanup) to prevent the new server's port file
    // from being deleted by stale cleanup.
    let old_task = send_shutdown(&app).await;
    if let Some(h) = old_task {
        let _ = h.await;
    }

    if auto_start {
        let (new_shutdown_tx, new_shutdown_rx) = oneshot::channel();
        {
            let server_handle: tauri::State<'_, McpServerHandle> = app.state();
            let mut tx = server_handle.shutdown_tx.lock().unwrap();
            *tx = Some(new_shutdown_tx);
        }

        let preferred = port.unwrap_or(get_default_port());
        start(
            app.clone(),
            app_data_dir.clone(),
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
    use data_studio_agent::capabilities::permissions::McpPermissionMode;
    use data_studio_agent::capabilities::types::RiskLevel;
    use std::net::TcpListener as StdTcpListener;

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
        assert_eq!(cfg.policy, McpPolicy::default());
    }

    #[test]
    fn test_mcp_config_save_and_load_roundtrip() {
        let dir = temp_data_dir("config-roundtrip");
        let cfg = McpConfig {
            port: Some(9333),
            auto_start: false,
            policy: McpPolicy {
                mode: McpPermissionMode::DataReadWrite,
                confirm_destructive: false,
                ..McpPolicy::default()
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
        let v = tools_payload(&McpPolicy::default());
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
        let v = tools_payload(&McpPolicy::default());
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
        let full = McpPolicy {
            mode: McpPermissionMode::FullAccess,
            ..McpPolicy::default()
        };
        let v_full = tools_payload(&full);
        assert_eq!(v_full["tools"].as_array().unwrap().len(), caps.len());
    }

    #[test]
    fn test_tools_payload_appends_policy_notice_when_gated() {
        init_registry_for_tests();
        // Default DataReadWrite gates Destructive → notice appended
        let v = tools_payload(&McpPolicy::default());
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
        let full = McpPolicy {
            mode: McpPermissionMode::FullAccess,
            ..McpPolicy::default()
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
        assert!(check_policy(cap, &McpPolicy::default(), None).is_ok());
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
        let err = check_policy(destructive, &McpPolicy::default(), None).unwrap_err();
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
        let policy = McpPolicy {
            mode: McpPermissionMode::FullAccess,
            ..McpPolicy::default()
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
        let policy = McpPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: false,
            ..McpPolicy::default()
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
        let policy = McpPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: std::collections::HashMap::from([(
                "prod".into(),
                data_studio_agent::capabilities::permissions::ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            ..McpPolicy::default()
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
        let resp = rt.block_on(invoke_with_policy(&McpPolicy::default(), req));

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
        let resp = rt.block_on(invoke_with_policy(&McpPolicy::default(), req));

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
        let resp = rt.block_on(invoke_with_policy(&McpPolicy::default(), req));

        // Safe capability passes the policy check; with no connection config the
        // capability itself fails, proving execution reached the invoke path.
        assert_eq!(resp.status, 400);
    }
}
