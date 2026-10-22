use async_trait::async_trait;
use data_studio_agent::tool_executor::{
    ToolCallPreparation, ToolEnvelope, ToolExecutionError, ToolExecutor, ToolResultMetadata,
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

pub(crate) struct DocKitToolExecutor {
    pub(crate) access: crate::ai_permissions::AgentAccess,
}

#[async_trait]
impl ToolExecutor for DocKitToolExecutor {
    fn prepare(
        &self,
        tool_name: &str,
        arguments: &Value,
        config: &Value,
        _connections: &HashMap<String, Value>,
    ) -> Result<ToolCallPreparation, String> {
        crate::ai_permissions::prepare_agent_call(&self.access, tool_name, arguments, config)
    }

    async fn execute(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, String> {
        self.execute_checked(tool_name, arguments, connection_config)
            .await
            .map_err(|e| e.to_string())
    }

    async fn execute_checked(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, ToolExecutionError> {
        let start = std::time::Instant::now();
        let raw = crate::ai_permissions::invoke_ai(
            tool_name,
            arguments,
            connection_config,
            Some(&self.access),
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
