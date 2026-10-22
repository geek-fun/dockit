use async_trait::async_trait;
use data_studio_agent::tool_executor::{
    ToolCallPreparation, ToolEnvelope, ToolExecutor, ToolResultMetadata,
};
use serde_json::Value;
use std::collections::HashMap;

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
    fn prepare(
        &self,
        tool_name: &str,
        arguments: &Value,
        config: &Value,
        connections: &HashMap<String, Value>,
    ) -> Result<ToolCallPreparation, String> {
        crate::ai_permissions::prepare_agent_call(tool_name, arguments, config, connections)
    }

    async fn execute(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, String> {
        let start = std::time::Instant::now();
        let policy =
            crate::ai_permissions::authorize_tool_call(tool_name, arguments, connection_config)?;

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
