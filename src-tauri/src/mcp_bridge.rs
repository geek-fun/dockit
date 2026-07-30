//! Embedded HTTP bridge for MCP protocol.
//!
//! Exposes the capability system over HTTP so the external TypeScript
//! MCP server (`data-studio-mcp`) can invoke tools and list capabilities.
//!
//! Only binds to 127.0.0.1 — not reachable from other machines.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::Json;
use data_studio_agent::capabilities::registry;
use data_studio_agent::capabilities::types::Capability;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use tokio::net::TcpListener;
use std::sync::Mutex;
use tokio::sync::oneshot;

// ---------------------------------------------------------------------------
// Managed state (Tauri)
// ---------------------------------------------------------------------------

/// Server lifecycle handle managed as Tauri state.
/// Uses std::sync::Mutex so it can be accessed from sync (setup hook) and async contexts.
pub struct McpServerHandle {
    pub shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl McpServerHandle {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
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
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
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
    app_version: &'static str,
    app_data_dir: PathBuf,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/// POST /tools — return all agent-tagged capabilities + connections
async fn handle_tools(
    State(state): State<Arc<BridgeState>>,
) -> Json<Value> {
    let reg = registry::registry();
    let caps = reg.agent_tools();

    let openai_tools: Vec<Value> = caps.iter().map(|c| to_openai_tool(c)).collect();
    let metadata: serde_json::Map<String, Value> = caps
        .iter()
        .map(|cap| (cap.name.to_string(), to_metadata(cap)))
        .collect();

    // Build a minimal connections list from the store
    let connections = list_connections(&state.handle);

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata,
        "connections": connections,
    });

    Json(result)
}

/// POST /invoke — execute a capability by name
async fn handle_invoke(
    State(state): State<Arc<BridgeState>>,
    Json(payload): Json<InvokeRequest>,
) -> Json<InvokeResponse> {
    let config = match payload.connection_id {
        Some(ref id) => {
            match resolve_connection(&state.handle, id).await {
                Ok(cfg) => Some(cfg),
                Err(e) => return Json(InvokeResponse::error(400, e)),
            }
        }
        None => None,
    };

    match registry::invoke_capability_inner(&payload.name, payload.args, config).await {
        Ok(data) => {
            // Try to parse as JSON
            match serde_json::from_str::<Value>(&data) {
                Ok(parsed) => Json(InvokeResponse::ok(parsed)),
                Err(_) => Json(InvokeResponse::ok(json!({"result": data}))),
            }
        }
        Err(msg) => Json(InvokeResponse::error(400, msg)),
    }
}

/// GET /health — health check
async fn handle_health(
    State(state): State<Arc<BridgeState>>,
) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "app": state.app_name,
        "version": state.app_version,
        "port": get_actual_port(&state.app_data_dir).unwrap_or(0),
    }))
}

// ---------------------------------------------------------------------------
// Bridge startup
// ---------------------------------------------------------------------------

/// Default MCP bridge port (9120 for dockit, 9121 for sqlkit).
/// Overridden by this function — set via compile-time constant or parameter.
fn get_default_port() -> u16 {
    9120
}

/// Check if a port is available on 127.0.0.1
fn port_available(port: u16) -> bool {
    std::net::TcpListener::bind(std::net::SocketAddrV4::new(
        std::net::Ipv4Addr::LOCALHOST,
        port,
    ))
    .is_ok()
}

/// Read the actual port from the port file
fn get_actual_port(app_data_dir: &Path) -> Option<u16> {
    let path = app_data_dir.join("mcp-port");
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
}

/// Write the port file
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

/// Remove the port file (cleanup on shutdown)
async fn remove_port_file(app_data_dir: &Path) {
    let path = app_data_dir.join("mcp-port");
    let _ = tokio::fs::remove_file(path).await;
}

/// Start the MCP bridge HTTP server.
///
/// Accepts a `shutdown_rx` so the caller controls the server lifecycle.
/// Returns the actual port the server is listening on.
pub async fn start(
    handle: AppHandle,
    app_data_dir: PathBuf,
    preferred_port: u16,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<u16, String> {
    let port = if port_available(preferred_port) {
        preferred_port
    } else {
        log::warn!(
            "MCP bridge port {} is in use, picking random port",
            preferred_port
        );
        portpicker::pick_unused_port().ok_or("no port available")?
    };

    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Failed to bind bridge: {}", e))?;

    let state = Arc::new(BridgeState {
        handle: handle.clone(),
        app_name: "dockit",
        app_version: "0.0.0",
        app_data_dir: app_data_dir.clone(),
    });

    let app = axum::Router::new()
        .route("/tools", post(handle_tools))
        .route("/invoke", post(handle_invoke))
        .route("/health", get(handle_health))
        .with_state(state);

    let data_dir = app_data_dir.clone();

    // Start server
    tokio::spawn(async move {
        log::info!("MCP bridge listening on 127.0.0.1:{}", port);
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                shutdown_rx.await.ok();
                log::info!("MCP bridge shutting down");
            })
            .await
            .ok();
        let _ = remove_port_file(&data_dir).await;
    });

    write_port_file(&app_data_dir, port).await?;

    Ok(port)
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

/// Read connections from `.store.dat` and return a minimal safe list.
fn list_connections(handle: &AppHandle) -> Value {
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

/// Resolve connection config from a connection_id (dockit-specific).
async fn resolve_connection(handle: &AppHandle, connection_id: &str) -> Result<Value, String> {
    use crate::common::connection_resolver::ConnectionResolver;
    use crate::common::ssh_bridge::resolve_ssh_in_place;

    let mut config = ConnectionResolver::resolve(handle, connection_id)?;
    resolve_ssh_in_place(handle, &mut config).await?;
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

    if auto_start {
        let server_handle: tauri::State<'_, McpServerHandle> = app.state();
        let old_tx = {
            let mut tx = server_handle.shutdown_tx.lock().unwrap();
            tx.take()
        };
        if let Some(sender) = old_tx {
            let _ = sender.send(());
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }

        let (new_shutdown_tx, new_shutdown_rx) = oneshot::channel();
        {
            let mut tx = server_handle.shutdown_tx.lock().unwrap();
            *tx = Some(new_shutdown_tx);
        }

        let preferred = port.unwrap_or(get_default_port());
        start(app.clone(), app_data_dir.clone(), preferred, new_shutdown_rx).await?;
    }

    Ok(serde_json::to_string(&json!({"status": "ok"})).map_err(|e| e.to_string())?)
}
