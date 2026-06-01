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

// ---------------------------------------------------------------------------
// Registry unit tests — cross-platform (no real handler linkage needed)
// ---------------------------------------------------------------------------

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
        handler: Arc::new(TestHandler),
        ..cap_meta("", RiskLevel::Safe, "read", SourceKind::Database("ELASTICSEARCH"), &["agent"])
    });
    reg.register(Capability {
        name: "dockit__list_connections",
        handler: Arc::new(TestHandler),
        ..cap_meta("", RiskLevel::Safe, "none", SourceKind::DocKit, &["agent"])
    });
    reg.register(Capability {
        name: "dynamo__list_tables",
        handler: Arc::new(TestHandler),
        ..cap_meta("", RiskLevel::Safe, "read", SourceKind::Database("DYNAMODB"), &["agent"])
    });

    let es = reg.matching_sources(&["ELASTICSEARCH".to_string()]);
    assert_eq!(es.len(), 2);
    assert!(es.iter().any(|c| c.name == "es__search"));
    assert!(es.iter().any(|c| c.name == "dockit__list_connections"));
    assert!(!es.iter().any(|c| c.name == "dynamo__list_tables"));

    assert_eq!(reg.matching_sources(&["DYNAMODB".to_string()]).len(), 2);
    assert_eq!(reg.matching_sources(&[]).len(), 1);
}

fn cap_meta(desc: &'static str, risk: RiskLevel, perm: &'static str, src: SourceKind, tags: &'static [&'static str]) -> Capability {
    Capability {
        name: "",
        description: desc,
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: risk,
        required_permission: perm,
        source_kind: src,
        tags,
    }
}

#[test]
fn test_agent_tools_filter() {
    let mut reg = CapabilityRegistry::new();
    reg.register(Capability {
        name: "agent_tool",
        handler: Arc::new(TestHandler),
        ..cap_meta("", RiskLevel::Safe, "read", SourceKind::DocKit, &["agent"])
    });
    reg.register(Capability {
        name: "ui_tool",
        handler: Arc::new(TestHandler),
        ..cap_meta("", RiskLevel::Safe, "read", SourceKind::DocKit, &["ui"])
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

// ---------------------------------------------------------------------------
// Real handler linkage tests — Unix-only
// Windows PE requires load-time resolution of ALL DLL imports.  The real
// handler vtables (mongodb, aws-sdk-*, reqwest) pull in additional Windows
// system DLL imports that may not resolve in the CI runner.  Linux/macOS
// ELF lazy binding defers resolution until code is actually executed, so
// constructing handlers (without calling them) works fine.
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "windows"))]
#[test]
fn test_init_registry_no_panic() {
    crate::capabilities::registry::init_registry();
    let reg = crate::capabilities::registry::registry();
    assert!(reg.get("es__search").is_some());
    assert!(reg.get("dynamo__execute_query").is_some());
    assert!(reg.get("mongo__find").is_some());
    assert!(reg.get("dockit__list_connections").is_some());
    assert_eq!(reg.iter().count(), 67);
}

#[cfg(not(target_os = "windows"))]
#[tokio::test]
async fn test_invoke_capability_unknown_tool() {
    crate::capabilities::registry::init_registry();
    let result = crate::capabilities::registry::invoke_capability_inner(
        "nonexistent",
        json!({}),
        None,
    )
    .await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Unknown capability"));
}

#[cfg(not(target_os = "windows"))]
#[test]
#[should_panic(expected = "Duplicate capability registration")]
fn test_registry_duplicate_panics() {
    let mut reg = CapabilityRegistry::new();
    let cap = || Capability {
        name: "dup__tool",
        description: "",
        handler: Arc::new(TestHandler),
        input_schema: json!({}),
        risk_level: RiskLevel::Safe,
        required_permission: "read",
        source_kind: SourceKind::DocKit,
        tags: &["agent"],
    };
    reg.register(cap());
    reg.register(cap());
}
