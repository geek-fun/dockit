use serde_json::{json, Value};
use tauri::AppHandle;

use super::registry;
use crate::common::connection_resolver::ConnectionResolver;

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
