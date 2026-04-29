use async_trait::async_trait;
use serde_json::Value;

use crate::agent::executor::ToolEnvelope;

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, String>;
}
