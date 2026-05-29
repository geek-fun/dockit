use serde_json::{json, Value};
use tauri::AppHandle;

use super::registry;
use crate::common::connection_resolver::ConnectionResolver;

/// Backward-compatible alias for `invoke_capability`.
///
/// The original `execute_tool` accepted `arguments` as a JSON string and
/// `connection_config` as a non-optional value (null when absent). This
/// wrapper preserves that interface for any frontend callers still using
/// the old command name.
/// When `connection_id` is provided, it takes priority over `connection_config`
/// and resolves credentials via ConnectionResolver (no IPC credential exposure).
#[tauri::command]
pub async fn execute_tool(
    tool_name: String,
    arguments: String,
    connection_config: Value,
    connection_id: Option<String>,
    app: AppHandle,
) -> Result<String, String> {
    let args: Value = serde_json::from_str(&arguments)
        .map_err(|e| format!("Failed to parse arguments: {}", e))?;
    let conn_opt = if let Some(ref id) = connection_id {
        Some(ConnectionResolver::resolve(&app, id)?)
    } else if connection_config.is_null() {
        None
    } else {
        Some(connection_config)
    };
    registry::invoke_capability_inner(&tool_name, args, conn_opt).await
}

/// Invoke a capability by name with JSON arguments, using a connection_id
/// to resolve credentials on the Rust side.
///
/// This is the UI-facing entry point into the capability system.
/// The agent loop uses `invoke_capability_inner` directly.
#[tauri::command]
pub async fn invoke_capability(
    name: String,
    args: Value,
    connection_id: Option<String>,
    app: AppHandle,
) -> Result<String, String> {
    let config = match connection_id {
        Some(ref id) => Some(ConnectionResolver::resolve(&app, id)?),
        None => None,
    };
    registry::invoke_capability_inner(&name, args, config).await
}

/// Return all agent-available capabilities, optionally filtered by database type.
///
/// `source_kinds` — list of database type strings (e.g. "ELASTICSEARCH",
/// "DYNAMODB", "MONGODB"). Only tools matching those types plus DocKit
/// environment tools are returned. When absent, all agent-tagged
/// capabilities are returned.
///
/// Output format matches the old `get_all_tools()` for backward
/// compatibility — JSON object with `tools` (OpenAI format) and
/// `metadata` keys.
#[tauri::command]
pub async fn get_available_tools(source_kinds: Option<Vec<String>>) -> Result<String, String> {
    let reg = registry::registry();
    let db_types = source_kinds.unwrap_or_default();

    let caps = if db_types.is_empty() {
        reg.agent_tools()
    } else {
        reg.matching_sources(&db_types)
    };

    let openai_tools: Vec<Value> = caps.iter().map(|c| to_openai_tool(c)).collect();
    let metadata: serde_json::Map<String, Value> = caps
        .iter()
        .map(|cap| (cap.name.to_string(), to_metadata(cap)))
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata,
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

fn to_openai_tool(cap: &super::Capability) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": cap.name,
            "description": cap.description,
            "parameters": cap.input_schema.clone()
        }
    })
}

fn to_metadata(cap: &super::Capability) -> Value {
    json!({
        "riskLevel": cap.risk_level,
        "requiredPermission": cap.required_permission
    })
}
