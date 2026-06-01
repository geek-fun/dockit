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

fn cap_meta(desc: &'static str, risk: RiskLevel, perm: &'static str, src: SourceKind, tags: &'static [&'static str]) -> Capability {
    Capability {
        name: "", description: desc, handler: Arc::new(TestHandler),
        input_schema: json!({}), risk_level: risk,
        required_permission: perm, source_kind: src, tags,
    }
}

#[test]
fn test_matching_sources_es() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability { name: "es__search", handler: Arc::new(TestHandler), ..cap_meta("", RiskLevel::Safe, "read", SourceKind::Database("ELASTICSEARCH"), &["agent"]) });
    reg.register(Capability { name: "dockit__list_connections", handler: Arc::new(TestHandler), ..cap_meta("", RiskLevel::Safe, "none", SourceKind::DocKit, &["agent"]) });
    reg.register(Capability { name: "dynamo__list_tables", handler: Arc::new(TestHandler), ..cap_meta("", RiskLevel::Safe, "read", SourceKind::Database("DYNAMODB"), &["agent"]) });
    assert_eq!(reg.matching_sources(&["ELASTICSEARCH".to_string()]).len(), 2);
    assert_eq!(reg.matching_sources(&[]).len(), 1);
}

#[test]
fn test_agent_tools_filter() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability { name: "agent_tool", handler: Arc::new(TestHandler), ..cap_meta("", RiskLevel::Safe, "read", SourceKind::DocKit, &["agent"]) });
    reg.register(Capability { name: "ui_tool", handler: Arc::new(TestHandler), ..cap_meta("", RiskLevel::Safe, "read", SourceKind::DocKit, &["ui"]) });
    assert_eq!(reg.agent_tools().len(), 1);
}

#[test]
fn test_source_kind_matches_db_type() {
    let es = SourceKind::Database("ELASTICSEARCH");
    assert!(es.matches_db_type("ELASTICSEARCH"));
    assert!(!SourceKind::DocKit.matches_db_type("ELASTICSEARCH"));
}

// ---------------------------------------------------------------------------
// Real handler initialization (constructs all 67 handler vtables)
// ---------------------------------------------------------------------------

#[test]
fn test_init_registry_no_panic() {
    crate::capabilities::registry::init_registry();
    let reg = crate::capabilities::registry::registry();
    assert!(reg.get("es__search").is_some());
    assert!(reg.get("dockit__list_connections").is_some());
    assert_eq!(reg.iter().count(), 67);
}

#[tokio::test]
async fn test_invoke_capability_unknown_tool() {
    crate::capabilities::registry::init_registry();
    let result = crate::capabilities::registry::invoke_capability_inner("nonexistent", json!({}), None).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Unknown capability"));
}

// ---------------------------------------------------------------------------
// should_panic — isolated to find Windows crash cause
// ---------------------------------------------------------------------------

#[test]
fn test_registry_duplicate_returns_error() {
    // Non-panicking version of the duplicate registration test
    // On Windows, #[should_panic] can trigger STATUS_DLL_NOT_FOUND
    // due to how SEH interacts with the Rust panic runtime.
    use std::panic::{catch_unwind, AssertUnwindSafe};
    let mut reg = CapabilityRegistry::new();
    let cap = || Capability {
        name: "dup__tool", description: "", handler: Arc::new(TestHandler),
        input_schema: json!({}), risk_level: RiskLevel::Safe,
        required_permission: "read", source_kind: SourceKind::DocKit, tags: &["agent"],
    };
    reg.register(cap());
    let result = catch_unwind(AssertUnwindSafe(|| reg.register(cap())));
    assert!(result.is_err(), "second register with same name should panic");
}
