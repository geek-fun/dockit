use serde_json::{json, Value};
use tauri::AppHandle;

use super::registry;
use crate::common::connection_resolver::ConnectionResolver;
use crate::common::ssh_bridge::resolve_ssh_tunnel;

/// Resolve SSH tunnel and modify config in-place: replace host/port with
/// tunnel endpoint, remove ssh field so handlers don't need to know.
async fn resolve_config_via_ssh(
    app: &AppHandle,
    config: &mut Value,
) -> Result<(), String> {
    let ssh = config.get("ssh").cloned();
    let enabled = ssh
        .as_ref()
        .and_then(|s| s.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        if let Some(obj) = config.as_object_mut() {
            obj.remove("ssh");
        }
        return Ok(());
    }

    // Extract host and port — ES and MongoDB use host/port, DynamoDB
    // may have endpointUrl instead. SSH tunnel resolves against the
    // remote target.
    let mut remote_host = "localhost".to_string();
    let mut remote_port = 443u16;

    if let Some(obj) = config.as_object() {
        if let Some(h) = obj.get("host").and_then(|v| v.as_str()) {
            remote_host = h.to_string();
        }
        if let Some(p) = obj.get("port").and_then(|v| v.as_u64()) {
            remote_port = p as u16;
        }
        // DynamoDB may not have host/port, but has endpointUrl
        if let Some(url_str) = obj.get("endpointUrl").and_then(|v| v.as_str()) {
            if let Ok(parsed) = url::Url::parse(url_str) {
                if let Some(h) = parsed.host_str() {
                    remote_host = h.to_string();
                }
                if let Some(p) = parsed.port() {
                    remote_port = p;
                }
            }
        }
    }

    let endpoint = resolve_ssh_tunnel(app, ssh.as_ref(), &remote_host, remote_port).await?;
    if let Some(obj) = config.as_object_mut() {
        obj.insert("host".to_string(), json!(endpoint.host));
        obj.insert("port".to_string(), json!(endpoint.port));
        // For DynamoDB, also set endpointUrl so the SDK connects through the tunnel
        obj.insert(
            "endpointUrl".to_string(),
            json!(format!("http://{}:{}", endpoint.host, endpoint.port)),
        );
        obj.remove("ssh");
    }
    Ok(())
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
    let mut config = match connection_id {
        Some(ref id) => Some(ConnectionResolver::resolve(&app, id)?),
        None => None,
    };

    // Resolve SSH tunnel at the capability layer — handlers get a config
    // with host/port already pointing at the tunnel endpoint.
    if let Some(ref mut cfg) = config {
        resolve_config_via_ssh(&app, cfg).await?;
    }

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

    // matching_sources returns only DocKit tools when db_types is empty,
    // and DocKit + matching database tools when db_types are provided.
    let caps = reg.matching_sources(&db_types);

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

#[cfg(test)]
mod tests {
    use crate::capabilities::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};
    use async_trait::async_trait;
    use serde_json::{json, Value};
    use std::sync::Arc;

    struct TestHandler;
    #[async_trait]
    impl CapabilityHandler for TestHandler {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            Ok("ok".to_string())
        }
    }

    fn make_cap(name: &'static str, risk: RiskLevel, perm: &'static str) -> Capability {
        Capability {
            name,
            description: "desc",
            handler: Arc::new(TestHandler),
            input_schema: json!({"type": "object", "properties": {}}),
            risk_level: risk,
            required_permission: perm,
            source_kind: SourceKind::DocKit,
            tags: &["agent"],
            parallel_ok: false,
        }
    }

    #[test]
    fn test_to_openai_tool_format() {
        let cap = make_cap("test__tool", RiskLevel::Safe, "read");
        let tool = super::to_openai_tool(&cap);
        assert_eq!(tool["type"], "function");
        assert_eq!(tool["function"]["name"], "test__tool");
        assert_eq!(tool["function"]["description"], "desc");
        assert!(tool["function"]["parameters"].is_object());
    }

    #[test]
    fn test_to_openai_tool_includes_schema() {
        let mut cap = make_cap("test__schema", RiskLevel::Elevated, "write");
        cap.input_schema = json!({"type": "object", "properties": {"idx": {"type": "string"}}, "required": ["idx"]});
        let tool = super::to_openai_tool(&cap);
        let params = &tool["function"]["parameters"];
        assert_eq!(params["properties"]["idx"]["type"], "string");
        assert_eq!(params["required"][0], "idx");
    }

    #[test]
    fn test_to_metadata_safe() {
        let cap = make_cap("safe__tool", RiskLevel::Safe, "read");
        let meta = super::to_metadata(&cap);
        assert_eq!(meta["riskLevel"], "safe");
        assert_eq!(meta["requiredPermission"], "read");
    }

    #[test]
    fn test_to_metadata_destructive() {
        let cap = make_cap("dest__tool", RiskLevel::Destructive, "delete");
        let meta = super::to_metadata(&cap);
        assert_eq!(meta["riskLevel"], "destructive");
        assert_eq!(meta["requiredPermission"], "delete");
    }

    #[test]
    fn test_to_metadata_elevated() {
        let cap = make_cap("elev__tool", RiskLevel::Elevated, "create");
        let meta = super::to_metadata(&cap);
        assert_eq!(meta["riskLevel"], "elevated");
    }

    #[test]
    fn test_get_available_tools_without_source_kinds() {
        // The global registry needs to be initialized once.
        let _ = crate::capabilities::registry::init_registry();

        let result =
            futures::executor::block_on(super::get_available_tools(None));
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        assert!(body.contains("tools"), "response should contain tools array");
        assert!(body.contains("metadata"), "response should contain metadata");
    }

    #[test]
    fn test_get_available_tools_with_es_source() {
        let _ = crate::capabilities::registry::init_registry();

        let result = futures::executor::block_on(super::get_available_tools(Some(
            vec!["ELASTICSEARCH".to_string()],
        )));
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        // Should include ES tools
        assert!(body.contains("es__search"), "should include es__search");
        assert!(body.contains("es__cat_indices"), "should include es__cat_indices");
    }

    #[test]
    fn test_get_available_tools_with_empty_source_list() {
        let _ = crate::capabilities::registry::init_registry();

        let result = futures::executor::block_on(super::get_available_tools(Some(
            vec![],
        )));
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        // Empty list should only return DocKit (env) tools, not DB-specific tools
        assert!(!body.contains("es__search"), "should NOT include es__search");
        assert!(!body.contains("dynamo__"), "should NOT include dynamo tools");
    }

    #[test]
    fn test_to_openai_tool_minimal_fields() {
        let cap = Capability {
            name: "minimal",
            description: "",
            handler: Arc::new(TestHandler),
            input_schema: json!({"type": "object", "properties": {}}),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            source_kind: SourceKind::DocKit,
            tags: &[],
            parallel_ok: false,
        };
        let tool = super::to_openai_tool(&cap);
        assert_eq!(tool["type"], "function");
        assert_eq!(tool["function"]["name"], "minimal");
        assert_eq!(tool["function"]["description"], "");
    }

    #[test]
    fn test_to_metadata_all_risk_levels() {
        let levels = [
            (RiskLevel::Safe, "safe"),
            (RiskLevel::Elevated, "elevated"),
            (RiskLevel::Destructive, "destructive"),
        ];
        for (risk, expected) in &levels {
            let cap = make_cap("test_tool", *risk, "read");
            let meta = super::to_metadata(&cap);
            assert_eq!(meta["riskLevel"], *expected, "mismatch for {:?}", risk);
        }
    }
}
