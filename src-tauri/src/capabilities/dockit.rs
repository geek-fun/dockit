use std::sync::Arc;

use serde_json::Value;
use tauri_plugin_store::StoreExt;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// Connection store abstraction (testable via mockall)
// ---------------------------------------------------------------------------

#[cfg_attr(test, mockall::automock)]
pub(crate) trait ConnectionStoreReader: Send + Sync {
    fn get_connections(&self) -> Result<Value, String>;
}

pub(crate) struct TauriStoreReader;

impl ConnectionStoreReader for TauriStoreReader {
    fn get_connections(&self) -> Result<Value, String> {
        let app = crate::APP_HANDLE
            .get()
            .ok_or_else(|| "AppHandle not initialized — app may still be starting".to_string())?;

        let store = app
            .store(".store.dat")
            .map_err(|e| format!("Failed to open store: {}", e))?;

        Ok(store.get("connections").unwrap_or(Value::Array(vec![])))
    }
}

// ---------------------------------------------------------------------------
// ListConnections handler
// ---------------------------------------------------------------------------

pub(crate) struct ListConnections {
    store: Box<dyn ConnectionStoreReader>,
}

impl ListConnections {
    pub(crate) fn new() -> Self {
        Self {
            store: Box::new(TauriStoreReader),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_store(store: Box<dyn ConnectionStoreReader>) -> Self {
        Self { store }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for ListConnections {
    async fn handle(
        &self,
        _args: &Value,
        _connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let connections = self.store.get_connections()?;

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
        handler: Arc::new(ListConnections::new()),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_list_connections_returns_safe_list() {
        let mut mock = MockConnectionStoreReader::new();
        mock.expect_get_connections()
            .return_once(|| {
                Ok(json!([
                    {"id": 1, "name": "My ES", "type": "ELASTICSEARCH", "password": "secret"},
                    {"id": 2, "name": "My Mongo", "type": "MONGODB", "password": "s3cret"},
                ]))
            });

        let handler = ListConnections::with_store(Box::new(mock));
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_ok(), "got: {:?}", result.err());

        let parsed: Value = serde_json::from_str(&result.unwrap()).unwrap();
        let conns = parsed["connections"].as_array().unwrap();
        assert_eq!(conns.len(), 2);

        // Only safe fields should be present
        assert_eq!(conns[0]["id"], 1);
        assert_eq!(conns[0]["name"], "My ES");
        assert_eq!(conns[0]["type"], "ELASTICSEARCH");
        assert!(conns[0].get("password").is_none(), "password must not leak");
    }

    #[tokio::test]
    async fn test_list_connections_empty() {
        let mut mock = MockConnectionStoreReader::new();
        mock.expect_get_connections()
            .return_once(|| Ok(json!([])));

        let handler = ListConnections::with_store(Box::new(mock));
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_ok());

        let parsed: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(parsed["connections"].as_array().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_list_connections_store_error() {
        let mut mock = MockConnectionStoreReader::new();
        mock.expect_get_connections()
            .return_once(|| Err("store error".to_string()));

        let handler = ListConnections::with_store(Box::new(mock));
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("store error"));
    }

    #[tokio::test]
    async fn test_list_connections_filters_nulls() {
        let mut mock = MockConnectionStoreReader::new();
        mock.expect_get_connections()
            .return_once(|| {
                Ok(json!([
                    {"id": null, "name": null, "type": null},
                    {"id": 1, "name": "valid", "type": "ES"},
                ]))
            });

        let handler = ListConnections::with_store(Box::new(mock));
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_ok());

        let parsed: Value = serde_json::from_str(&result.unwrap()).unwrap();
        let conns = parsed["connections"].as_array().unwrap();
        assert_eq!(conns.len(), 2);
        assert!(conns[0]["id"].is_null()); // null fields are preserved
        assert_eq!(conns[1]["name"], "valid");
    }
}
