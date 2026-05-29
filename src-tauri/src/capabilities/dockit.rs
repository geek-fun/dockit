use std::sync::Arc;

use serde_json::Value;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// DocKit environment capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct ListConnections;

#[async_trait::async_trait]
impl CapabilityHandler for ListConnections {
    async fn handle(&self, _args: &Value, _connection_config: Option<&Value>) -> Result<String, String> {
        // This capability reads connections from application state.
        // Currently returns an empty list placeholder.
        // In the future, this will query the app's connection store.
        let result = serde_json::json!({
            "connections": []
        });
        Ok(result.to_string())
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

pub(crate) fn register_all(registry: &mut CapabilityRegistry) {
    registry.register(Capability {
        name: "dockit__list_connections",
        description: "List all configured database connections in DocKit with their name, type, and connection id.",
        handler: Arc::new(ListConnections),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {},
            "required": []
        }),
        risk_level: RiskLevel::Safe,
        required_permission: "none",
        source_kind: SourceKind::DocKit,
        tags: &["agent"],
    });
}
