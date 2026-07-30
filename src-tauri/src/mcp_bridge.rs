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
        match std::fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str(&s) {
                Ok(cfg) => cfg,
                Err(e) => {
                    log::warn!("Failed to parse mcp-config.json (corrupt?): {}. Using defaults.", e);
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

async fn handle_tools(
    State(_state): State<Arc<BridgeState>>,
) -> Json<Value> {
    let reg = registry::registry();
    let caps = reg.agent_tools();

    let openai_tools: Vec<Value> = caps.iter().map(|c| to_openai_tool(c)).collect();
    let metadata: serde_json::Map<String, Value> = caps
        .iter()
        .map(|cap| (cap.name.to_string(), to_metadata(cap)))
        .collect();

    let connections = list_connections();
    let result = json!({
        "tools": openai_tools,
        "metadata": metadata,
        "connections": connections,
    });
    Json(result)
}

async fn handle_invoke(
    Json(payload): Json<InvokeRequest>,
) -> Json<InvokeResponse> {
    // Reject destructive and elevated capabilities on the bridge
    let cap = match registry::registry().get(&payload.name) {
        Some(c) => c,
        None => return Json(InvokeResponse::error(404, format!("Unknown capability: {}", payload.name))),
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

async fn handle_health(
    State(state): State<Arc<BridgeState>>,
) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "app": state.app_name,
        "version": state.handle.package_info().version.to_string(),
        "port": get_actual_port(&state.app_data_dir).unwrap_or(0),
    }))
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
async fn send_shutdown(handle: &AppHandle) {
    let server_handle: tauri::State<'_, McpServerHandle> = handle.state();
    let old_tx = {
        let mut tx = server_handle.shutdown_tx.lock().unwrap();
        tx.take()
    };
    if let Some(sender) = old_tx {
        let _ = sender.send(());
    }
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
            tokio::spawn(async move {
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
            tokio::spawn(async move {
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
    let mut config = crate::common::connection_resolver::ConnectionResolver::resolve(handle, connection_id)?;
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

    let config = McpConfig {
        port,
        auto_start,
    };
    config.save(&app_data_dir)?;

    // Always shut down the current server first
    send_shutdown(&app).await;

    if auto_start {
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let (new_shutdown_tx, new_shutdown_rx) = oneshot::channel();
        {
            let server_handle: tauri::State<'_, McpServerHandle> = app.state();
            let mut tx = server_handle.shutdown_tx.lock().unwrap();
            *tx = Some(new_shutdown_tx);
        }

        let preferred = port.unwrap_or(get_default_port());
        start(app.clone(), app_data_dir.clone(), preferred, new_shutdown_rx).await?;
    }

    Ok(serde_json::to_string(&json!({"status": "ok"})).map_err(|e| e.to_string())?)
}
