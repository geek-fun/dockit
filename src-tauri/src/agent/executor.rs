use async_trait::async_trait;
use data_studio_agent::tool_executor::{ToolEnvelope, ToolExecutor, ToolResultMetadata};
use serde_json::Value;

const TOOL_ENVELOPE_MAX_CHARS: usize = 32768;
const TOOL_ENVELOPE_SUMMARY_CHARS: usize = 4096;

fn char_truncate(input: &str, max_chars: usize) -> (String, bool) {
    if input.chars().count() <= max_chars {
        return (input.to_string(), false);
    }
    let truncated: String = input.chars().take(max_chars).collect();
    (truncated, true)
}

pub struct DocKitToolExecutor;

#[async_trait]
impl ToolExecutor for DocKitToolExecutor {
    async fn execute(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, String> {
        let start = std::time::Instant::now();
        let app = crate::APP_HANDLE.get().ok_or("App not initialized")?;
        let policy = crate::mcp_bridge::load_permission_policy(app)?;
        let cap = data_studio_agent::capabilities::registry::registry()
            .get(tool_name)
            .ok_or("Unknown capability")?;
        let id = connection_config
            .get("connectionId")
            .and_then(Value::as_str);
        let restriction = connection_config
            .get("permissions")
            .filter(|v| !v.is_null())
            .map(|v| {
                serde_json::from_value::<
                    data_studio_agent::capabilities::permissions::PermissionRules,
                >(v.clone())
            })
            .transpose()
            .map_err(|e| e.to_string())?;
        policy.authorize(cap, arguments, id, restriction.as_ref())?;

        let conn_opt = if connection_config.is_null() {
            None
        } else {
            Some(connection_config.clone())
        };

        let raw = data_studio_agent::capabilities::registry::invoke_capability_inner(
            tool_name,
            arguments.clone(),
            conn_opt,
        )
        .await?;

        let raw = if tool_name.ends_with("__list_connections") {
            let mut result: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            if let Some(connections) = result.get("connections").and_then(Value::as_array) {
                let filtered = connections
                    .iter()
                    .filter(|connection| {
                        let id = match &connection["id"] {
                            Value::String(id) => id.clone(),
                            Value::Number(id) => id.to_string(),
                            _ => return false,
                        };
                        let in_scope = connection_config
                            .get("__allowed_connection_ids")
                            .and_then(Value::as_array)
                            .is_some_and(|ids| {
                                ids.iter().any(|allowed| allowed.as_str() == Some(&id))
                            });
                        in_scope && policy.effective_permissions(&id).any_allowed()
                    })
                    .cloned()
                    .collect::<Vec<_>>();
                result["connections"] = serde_json::json!(filtered);
            }
            result.to_string()
        } else {
            raw
        };
        let duration_ms = start.elapsed().as_millis() as u64;
        let (full_result, truncated) = char_truncate(&raw, TOOL_ENVELOPE_MAX_CHARS);
        let (summary, _) = char_truncate(&full_result, TOOL_ENVELOPE_SUMMARY_CHARS);

        Ok(ToolEnvelope {
            summary,
            full_result,
            metadata: ToolResultMetadata {
                tool_name: tool_name.to_string(),
                duration_ms,
                truncated,
            },
        })
    }
}
