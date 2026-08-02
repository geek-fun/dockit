use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::Mutex;

use axum::extract::State;
use axum::routing::{get, post};
use axum::Json;
use data_studio_agent::capabilities::registry;
use data_studio_agent::capabilities::types::{Capability, RiskLevel};
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
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

fn tools_payload() -> Value {
    let reg = registry::registry();
    let caps = reg.agent_tools();

    let openai_tools: Vec<Value> = caps.iter().map(|c| to_openai_tool(c)).collect();
    let metadata: serde_json::Map<String, Value> = caps
        .iter()
        .map(|cap| (cap.name.to_string(), to_metadata(cap)))
        .collect();

    json!({
        "tools": openai_tools,
        "metadata": metadata,
    })
}

async fn handle_tools(State(_state): State<Arc<BridgeState>>) -> Json<Value> {
    let mut result = tools_payload();
    result["connections"] = list_connections();
    Json(result)
}

async fn handle_invoke(Json(payload): Json<InvokeRequest>) -> Json<InvokeResponse> {
    // Reject destructive and elevated capabilities on the bridge
    let cap = match registry::registry().get(&payload.name) {
        Some(c) => c,
        None => {
            return Json(InvokeResponse::error(
                404,
                format!("Unknown capability: {}", payload.name),
            ))
        }
    };

    match cap.risk_level {
        RiskLevel::Safe => {}
        RiskLevel::Elevated | RiskLevel::Destructive => {
            let level_str = serde_json::to_string(&cap.risk_level).unwrap_or_default();
            return Json(InvokeResponse::error(
                403,
                format!(
                    "Capability '{}' requires {} permission and is not allowed through the MCP bridge",
                    payload.name, level_str
                ),
            ));
        }
    }

    // Connection resolution is handled server-side via the configured connection
    let config = match payload.connection_id {
        Some(ref id) => match resolve_connection(id).await {
            Ok(cfg) => Some(cfg),
            Err(e) => return Json(InvokeResponse::error(400, e)),
        },
        None => None,
    };

    match registry::invoke_capability_inner(&payload.name, payload.args, config).await {
        Ok(data) => match serde_json::from_str::<Value>(&data) {
            Ok(parsed) => Json(InvokeResponse::ok(parsed)),
            Err(_) => Json(InvokeResponse::ok(json!({"result": data}))),
        },
        Err(msg) => Json(InvokeResponse::error(400, msg)),
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
    let port = match TcpListener::bind(format!("127.0.0.1:{}", preferred_port)).await {
        Ok(listener) => {
            let state = Arc::new(BridgeState {
                handle: handle.clone(),
                app_name: "dockit",
                app_data_dir: app_data_dir.clone(),
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

fn to_openai_tool(cap: &Capability) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": cap.name,
            "description": cap.description,
            "parameters": cap.input_schema.clone()
        }
    })
}

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
    });

    serde_json::to_string(&status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_mcp_config(
    port: Option<u16>,
    auto_start: bool,
    app: AppHandle,
) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
        .to_path_buf();

    let config = McpConfig { port, auto_start };
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
    }

    #[test]
    fn test_mcp_config_save_and_load_roundtrip() {
        let dir = temp_data_dir("config-roundtrip");
        let cfg = McpConfig {
            port: Some(9333),
            auto_start: false,
        };
        cfg.save(&dir).unwrap();

        let loaded = McpConfig::load(&dir);
        assert_eq!(loaded.port, Some(9333));
        assert!(!loaded.auto_start);

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
    fn test_to_openai_tool_and_metadata() {
        init_registry_for_tests();
        let reg = registry::registry();
        let caps = reg.agent_tools();
        assert!(!caps.is_empty(), "registry should have agent tools");
        let cap = &caps[0];

        let tool = to_openai_tool(cap);
        assert_eq!(tool["type"], "function");
        assert_eq!(tool["function"]["name"], cap.name);
        assert_eq!(tool["function"]["description"], cap.description);
        assert!(tool["function"]["parameters"].is_object());

        let meta = to_metadata(cap);
        assert!(meta["riskLevel"].is_string());
        assert!(meta["requiredPermission"].is_string());
    }

    #[test]
    fn test_tools_payload_contains_tools_and_metadata() {
        init_registry_for_tests();
        let v = tools_payload();
        assert!(v["tools"].as_array().unwrap().len() > 0);
        assert!(v["metadata"].as_object().unwrap().len() > 0);
        // tools and metadata must be keyed by the same capability names
        let names: std::collections::HashSet<&str> = v["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["function"]["name"].as_str().unwrap())
            .collect();
        for name in names {
            assert!(
                v["metadata"].get(name).is_some(),
                "missing metadata for {name}"
            );
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
    fn test_handle_invoke_unknown_capability_returns_404() {
        init_registry_for_tests();
        let req = InvokeRequest {
            name: "definitely__not_a_real_capability".into(),
            args: json!({}),
            connection_id: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let resp = rt.block_on(handle_invoke(Json(req))).0;

        assert_eq!(resp.status, 404);
        assert!(resp.message.unwrap().contains("Unknown capability"));
    }

    #[test]
    fn test_handle_invoke_rejects_elevated_and_destructive() {
        init_registry_for_tests();
        let tools = registry::registry().agent_tools();
        // Concurrent tests may initialize the global registry (OnceLock) with
        // test-only Safe capabilities; only assert when the full app registry is present.
        let Some(risky) = tools
            .iter()
            .find(|c| !matches!(c.risk_level, RiskLevel::Safe))
        else {
            return;
        };

        let req = InvokeRequest {
            name: risky.name.to_string(),
            args: json!({}),
            connection_id: None,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let resp = rt.block_on(handle_invoke(Json(req))).0;

        assert_eq!(resp.status, 403);
        assert!(resp
            .message
            .unwrap()
            .contains("not allowed through the MCP bridge"));
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
        let resp = rt.block_on(handle_invoke(Json(req))).0;

        // Safe capability passes the risk check; with no connection config the
        // capability itself fails, proving execution reached the invoke path.
        assert_eq!(resp.status, 400);
    }
}
