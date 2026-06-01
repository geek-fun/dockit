use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;

struct TestHandler;

#[async_trait]
impl CapabilityHandler for TestHandler {
    async fn handle(&self, _args: &Value, _config: Option<&Value>) -> Result<String, String> {
        Ok("test_ok".to_string())
    }
}

#[test]
fn test_registry_register_and_get() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability {
        name: "test__tool",
        description: "A test tool",
        handler: Arc::new(TestHandler),
        input_schema: json!({"type": "object", "properties": {}}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::Database("ELASTICSEARCH"),
        tags: &["agent"],
    });
    assert!(reg.get("test__tool").is_some());
    assert!(reg.get("nonexistent").is_none());
}
