use async_trait::async_trait;
use crate::capabilities::registry::CapabilityRegistry;
use crate::capabilities::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};
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

    let cap = reg.get("test__tool");
    assert!(cap.is_some(), "tool should be found");
    assert_eq!(cap.unwrap().name, "test__tool");

    let missing = reg.get("nonexistent");
    assert!(missing.is_none(), "nonexistent tool should not be found");
}

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
    reg.register(cap()); // should panic
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

    // Filtering for ES should return ES tools + DocKit tools
    let es_tools = reg.matching_sources(&["ELASTICSEARCH".to_string()]);
    let es_names: Vec<&str> = es_tools.iter().map(|c| c.name).collect();
    assert!(es_names.contains(&"es__search"));
    assert!(es_names.contains(&"dockit__list_connections"));
    assert!(!es_names.contains(&"dynamo__list_tables"));
    assert_eq!(es_tools.len(), 2);

    // Filtering for DynamoDB
    let dynamo_tools = reg.matching_sources(&["DYNAMODB".to_string()]);
    let dynamo_names: Vec<&str> = dynamo_tools.iter().map(|c| c.name).collect();
    assert!(dynamo_names.contains(&"dynamo__list_tables"));
    assert!(dynamo_names.contains(&"dockit__list_connections"));
    assert!(!dynamo_names.contains(&"es__search"));
    assert_eq!(dynamo_tools.len(), 2);

    // Empty filter returns only DocKit tools
    let empty_tools = reg.matching_sources(&[]);
    assert_eq!(empty_tools.len(), 1);
    assert_eq!(empty_tools[0].name, "dockit__list_connections");
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

    let agent_tools = reg.agent_tools();
    assert_eq!(agent_tools.len(), 1);
    assert_eq!(agent_tools[0].name, "agent_tool");
}

#[test]
fn test_source_kind_matches_db_type() {
    let es = SourceKind::Database("ELASTICSEARCH");
    assert!(es.matches_db_type("ELASTICSEARCH"));
    assert!(es.matches_db_type("elasticsearch"));
    assert!(es.matches_db_type("Elasticsearch"));
    assert!(!es.matches_db_type("DYNAMODB"));

    let doc_kit = SourceKind::DocKit;
    assert!(!doc_kit.matches_db_type("ELASTICSEARCH"));
}

/// Verify that the global registry can be initialized without panicking.
/// This validates that all hardcoded capability registrations work.
#[test]
fn test_init_registry_no_panic() {
    // Call init_registry in a fresh environment
    crate::capabilities::registry::init_registry();
    let reg = crate::capabilities::registry::registry();

    // All known tools should be present
    assert!(reg.get("es__search").is_some(), "es__search should be registered");
    assert!(reg.get("es__cat_indices").is_some(), "es__cat_indices should be registered");
    assert!(reg.get("es__get_mapping").is_some(), "es__get_mapping should be registered");
    assert!(reg.get("es__create_index").is_some(), "es__create_index should be registered");
    assert!(reg.get("es__delete_index").is_some(), "es__delete_index should be registered");
    assert!(reg.get("es__index_document").is_some(), "es__index_document should be registered");
    assert!(reg.get("es__get_document").is_some(), "es__get_document should be registered");
    assert!(reg.get("es__update_document").is_some(), "es__update_document should be registered");
    assert!(reg.get("es__delete_document").is_some(), "es__delete_document should be registered");
    assert!(reg.get("es__delete_by_query").is_some(), "es__delete_by_query should be registered");
    assert!(reg.get("es__put_mapping").is_some(), "es__put_mapping should be registered");
    assert!(reg.get("es__cat_aliases").is_some(), "es__cat_aliases should be registered");
    assert!(reg.get("es__get_alias").is_some(), "es__get_alias should be registered");
    assert!(reg.get("es__put_alias").is_some(), "es__put_alias should be registered");
    assert!(reg.get("es__delete_alias").is_some(), "es__delete_alias should be registered");
    assert!(reg.get("es__update_aliases").is_some(), "es__update_aliases should be registered");

    assert!(reg.get("dynamo__execute_query").is_some(), "dynamo__execute_query should be registered");
    assert!(reg.get("dynamo__execute_write").is_some(), "dynamo__execute_write should be registered");
    assert!(reg.get("dynamo__execute_delete").is_some(), "dynamo__execute_delete should be registered");
    assert!(reg.get("dynamo__describe_table").is_some(), "dynamo__describe_table should be registered");
    assert!(reg.get("dynamo__list_tables").is_some(), "dynamo__list_tables should be registered");
    assert!(reg.get("dynamo__query_table").is_some(), "dynamo__query_table should be registered");
    assert!(reg.get("dynamo__scan_table").is_some(), "dynamo__scan_table should be registered");
    assert!(reg.get("dynamo__create_item").is_some(), "dynamo__create_item should be registered");
    assert!(reg.get("dynamo__batch_write_items").is_some(), "dynamo__batch_write_items should be registered");
    assert!(reg.get("dynamo__update_item").is_some(), "dynamo__update_item should be registered");
    assert!(reg.get("dynamo__delete_item").is_some(), "dynamo__delete_item should be registered");
    assert!(reg.get("dynamo__create_gsi").is_some(), "dynamo__create_gsi should be registered");
    assert!(reg.get("dynamo__update_gsi").is_some(), "dynamo__update_gsi should be registered");
    assert!(reg.get("dynamo__delete_gsi").is_some(), "dynamo__delete_gsi should be registered");
    assert!(reg.get("dynamo__describe_continuous_backups").is_some(), "dynamo__describe_continuous_backups should be registered");
    assert!(reg.get("dynamo__describe_ttl").is_some(), "dynamo__describe_ttl should be registered");
    assert!(reg.get("dynamo__get_table_metrics").is_some(), "dynamo__get_table_metrics should be registered");
    assert!(reg.get("dynamo__create_table").is_some(), "dynamo__create_table should be registered");
    assert!(reg.get("dynamo__delete_table").is_some(), "dynamo__delete_table should be registered");
    assert!(reg.get("dynamo__truncate_table").is_some(), "dynamo__truncate_table should be registered");
    assert!(reg.get("dynamo__update_table_config").is_some(), "dynamo__update_table_config should be registered");
    assert!(reg.get("dynamo__update_ttl").is_some(), "dynamo__update_ttl should be registered");
    assert!(reg.get("dynamo__update_pitr").is_some(), "dynamo__update_pitr should be registered");
    assert!(reg.get("dynamo__update_streams").is_some(), "dynamo__update_streams should be registered");

    assert!(reg.get("mongo__find").is_some(), "mongo__find should be registered");
    assert!(reg.get("mongo__aggregate").is_some(), "mongo__aggregate should be registered");
    assert!(reg.get("mongo__insert_one").is_some(), "mongo__insert_one should be registered");
    assert!(reg.get("mongo__update_many").is_some(), "mongo__update_many should be registered");
    assert!(reg.get("mongo__delete_many").is_some(), "mongo__delete_many should be registered");
    assert!(reg.get("mongo__list_collections").is_some(), "mongo__list_collections should be registered");
    assert!(reg.get("mongo__list_databases").is_some(), "mongo__list_databases should be registered");
    assert!(reg.get("mongo__collection_stats").is_some(), "mongo__collection_stats should be registered");
    assert!(reg.get("mongo__database_stats").is_some(), "mongo__database_stats should be registered");
    assert!(reg.get("mongo__create_database").is_some(), "mongo__create_database should be registered");
    assert!(reg.get("mongo__drop_database").is_some(), "mongo__drop_database should be registered");
    assert!(reg.get("mongo__create_collection").is_some(), "mongo__create_collection should be registered");
    assert!(reg.get("mongo__drop_collection").is_some(), "mongo__drop_collection should be registered");
    assert!(reg.get("mongo__server_status").is_some(), "mongo__server_status should be registered");
    assert!(reg.get("mongo__repl_set_status").is_some(), "mongo__repl_set_status should be registered");
    assert!(reg.get("mongo__shard_status").is_some(), "mongo__shard_status should be registered");
    assert!(reg.get("mongo__count_documents").is_some(), "mongo__count_documents should be registered");
    assert!(reg.get("mongo__update_document").is_some(), "mongo__update_document should be registered");
    assert!(reg.get("mongo__delete_document").is_some(), "mongo__delete_document should be registered");
    assert!(reg.get("mongo__rename_collection").is_some(), "mongo__rename_collection should be registered");
    assert!(reg.get("mongo__clone_collection").is_some(), "mongo__clone_collection should be registered");
    assert!(reg.get("mongo__truncate_collection").is_some(), "mongo__truncate_collection should be registered");
    assert!(reg.get("mongo__list_indexes").is_some(), "mongo__list_indexes should be registered");
    assert!(reg.get("mongo__create_index").is_some(), "mongo__create_index should be registered");
    assert!(reg.get("mongo__drop_index").is_some(), "mongo__drop_index should be registered");
    assert!(reg.get("mongo__sample_documents").is_some(), "mongo__sample_documents should be registered");

    assert!(reg.get("dockit__list_connections").is_some(), "dockit__list_connections should be registered");

    // Verify count: 16 ES + 24 Dynamo + 26 Mongo + 1 dockit = 67
    let count = reg.iter().count();
    assert_eq!(count, 67, "expected 67 registered tools, got {}", count);
}

#[tokio::test]
async fn test_invoke_capability_unknown_tool() {
    crate::capabilities::registry::init_registry();
    let result = crate::capabilities::registry::invoke_capability_inner(
        "nonexistent",
        json!({}),
        None,
    )
    .await;
    assert!(result.is_err(), "unknown tool should return error");
    let err = result.unwrap_err();
    assert!(err.contains("Unknown capability"), "error should mention unknown capability, got: {}", err);
}
