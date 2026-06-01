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
fn test_init_registry_no_panic() {
    crate::capabilities::registry::init_registry();
    let reg = crate::capabilities::registry::registry();
    assert!(reg.get("es__search").is_some());
    assert!(reg.get("dockit__list_connections").is_some());
    assert_eq!(reg.iter().count(), 67);
}
