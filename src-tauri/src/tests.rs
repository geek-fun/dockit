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

#[test]
fn test_matching_sources_es() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability {
        name: "es__search",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::Database("ELASTICSEARCH"),
        tags: &["agent"],
    });
    reg.register(Capability {
        name: "dockit__list_connections",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "none",
        source_kind: SourceKind::DocKit,
        tags: &["agent"],
    });
    reg.register(Capability {
        name: "dynamo__list_tables",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::Database("DYNAMODB"),
        tags: &["agent"],
    });

    let es_tools = reg.matching_sources(&["ELASTICSEARCH".to_string()]);
    assert_eq!(es_tools.len(), 2);
    assert!(es_tools.iter().any(|c| c.name == "es__search"));
    assert!(es_tools.iter().any(|c| c.name == "dockit__list_connections"));
    assert!(!es_tools.iter().any(|c| c.name == "dynamo__list_tables"));

    assert_eq!(reg.matching_sources(&["DYNAMODB".to_string()]).len(), 2);
    assert_eq!(reg.matching_sources(&[]).len(), 1);
}

#[test]
fn test_agent_tools_filter() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability {
        name: "agent_tool",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::DocKit,
        tags: &["agent"],
    });
    reg.register(Capability {
        name: "ui_tool",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::DocKit,
        tags: &["ui"],
    });
    let tools = reg.agent_tools();
    assert_eq!(tools.len(), 1);
    assert_eq!(tools[0].name, "agent_tool");
}

#[test]
fn test_source_kind_matches_db_type() {
    let es = SourceKind::Database("ELASTICSEARCH");
    assert!(es.matches_db_type("ELASTICSEARCH"));
    assert!(es.matches_db_type("elasticsearch"));
    assert!(es.matches_db_type("Elasticsearch"));
    assert!(!es.matches_db_type("DYNAMODB"));
    assert!(!SourceKind::DocKit.matches_db_type("ELASTICSEARCH"));
}
