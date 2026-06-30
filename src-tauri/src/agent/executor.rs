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

        let conn_opt = if connection_config.is_null() {
            None
        } else {
            Some(connection_config.clone())
        };

        let raw = crate::capabilities::registry::invoke_capability_inner(
            tool_name,
            arguments.clone(),
            conn_opt,
        )
        .await?;

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
