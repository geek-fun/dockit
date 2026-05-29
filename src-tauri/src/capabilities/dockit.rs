use std::sync::Arc;

use serde_json::Value;
use tauri_plugin_store::StoreExt;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// DocKit environment capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct ListConnections;

#[async_trait::async_trait]
impl CapabilityHandler for ListConnections {
    async fn handle(
        &self,
        _args: &Value,
        _connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let app = crate::APP_HANDLE
            .get()
            .ok_or_else(|| "AppHandle not initialized — app may still be starting".to_string())?;

        let store = app
            .store(".store.dat")
            .map_err(|e| format!("Failed to open store: {}", e))?;

        let connections = store.get("connections").unwrap_or(Value::Array(vec![]));

        // Return only non-sensitive metadata: id, name, type
        let safe_list: Vec<Value> = connections
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|c| {
                        serde_json::json!({
                            "id": c.get("id"),
                            "name": c.get("name"),
                            "type": c.get("type"),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(serde_json::to_string(&serde_json::json!({
            "connections": safe_list
        }))
        .map_err(|e| e.to_string())?)
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
