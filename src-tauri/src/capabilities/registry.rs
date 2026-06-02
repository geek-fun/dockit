use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

use super::types::Capability;

static REGISTRY: OnceLock<CapabilityRegistry> = OnceLock::new();

/// Global capability registry, populated once at app startup.
pub fn registry() -> &'static CapabilityRegistry {
    REGISTRY.get().expect("CapabilityRegistry not initialized — call init_registry() on startup")
}

/// The capability registry — a name-indexed collection of all
/// capabilities in the application.
pub struct CapabilityRegistry {
    capabilities: HashMap<&'static str, Capability>,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self {
            capabilities: HashMap::new(),
        }
    }

    /// Register a single capability. Panics on duplicate names to catch
    /// registration errors early.
    pub fn register(&mut self, capability: Capability) {
        let name = capability.name;
        if self.capabilities.contains_key(name) {
            panic!("Duplicate capability registration: {}", name);
        }
        self.capabilities.insert(name, capability);
    }

    /// Look up a capability by name.
    pub fn get(&self, name: &str) -> Option<&Capability> {
        self.capabilities.get(name)
    }

    /// Iterate over all registered capabilities.
    #[allow(dead_code)]
    pub fn iter(&self) -> impl Iterator<Item = &Capability> {
        self.capabilities.values()
    }

    /// Return agent-tagged capabilities matching any of the given database type strings.
    pub fn matching_sources(&self, db_types: &[String]) -> Vec<&Capability> {
        self.capabilities
            .values()
            .filter(|cap| {
                // Only agent-tagged capabilities
                if !cap.tags.contains(&"agent") {
                    return false;
                }
                // Always include DocKit capabilities (no source needed)
                if cap.source_kind == super::types::SourceKind::DocKit {
                    return true;
                }
                db_types.iter().any(|dt| cap.source_kind.matches_db_type(dt))
            })
            .collect()
    }

    /// Return all capabilities tagged for the agent surface.
    pub fn agent_tools(&self) -> Vec<&Capability> {
        self.capabilities
            .values()
            .filter(|cap| cap.tags.contains(&"agent"))
            .collect()
    }

    /// Return all capabilities tagged for the UI surface.
    #[allow(dead_code)]
    pub fn ui_capabilities(&self) -> Vec<&Capability> {
        self.capabilities
            .values()
            .filter(|cap| cap.tags.contains(&"ui"))
            .collect()
    }
}

/// Initialize the global capability registry with all built-in capabilities.
///
/// Called once during app startup (in `main.rs` setup).
pub fn init_registry() {
    let mut reg = CapabilityRegistry::new();

    // Each database module registers its capabilities.
    // Order does not matter.
    crate::capabilities::es::register_all(&mut reg);
    crate::capabilities::dynamo::register_all(&mut reg);
    crate::capabilities::mongo::register_all(&mut reg);
    crate::capabilities::dockit::register_all(&mut reg);

    REGISTRY.set(reg).ok();
}

/// Invoke a capability by name with the given arguments and optional
/// connection config. Returns the raw result string.
///
/// This is the adapter used by both the `invoke_capability` Tauri command
/// and the agent loop. Both call through here.
pub async fn invoke_capability_inner(
    name: &str,
    args: Value,
    connection_config: Option<Value>,
) -> Result<String, String> {
    let cap = registry()
        .get(name)
        .ok_or_else(|| format!("Unknown capability: {}", name))?;

    let config_ref = connection_config.as_ref();
    cap.handler.handle(&args, config_ref).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};
    use async_trait::async_trait;
    use serde_json::json;
    use std::sync::Arc;

    struct TestHandler;

    #[async_trait]
    impl CapabilityHandler for TestHandler {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            Ok("ok".to_string())
        }
    }

    fn make_cap(
        name: &'static str,
        source: SourceKind,
        tags: &'static [&'static str],
    ) -> Capability {
        Capability {
            name,
            description: "test capability",
            handler: Arc::new(TestHandler),
            input_schema: json!({"type": "object", "properties": {}}),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            source_kind: source,
            tags,
        }
    }

    #[test]
    fn test_matching_sources_filters_by_db_type() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap(
            "es_tool",
            SourceKind::Database("ELASTICSEARCH"),
            &["agent"],
        ));
        reg.register(make_cap(
            "dynamo_tool",
            SourceKind::Database("DYNAMODB"),
            &["agent"],
        ));

        let results = reg.matching_sources(&["ELASTICSEARCH".to_string()]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "es_tool");

        let results = reg.matching_sources(&["DYNAMODB".to_string()]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "dynamo_tool");

        let results = reg.matching_sources(&["ELASTICSEARCH".to_string(), "DYNAMODB".to_string()]);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_matching_sources_excludes_non_agent_tags() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap(
            "ui_only",
            SourceKind::Database("ELASTICSEARCH"),
            &["ui"],
        ));
        reg.register(make_cap(
            "agent_tool",
            SourceKind::Database("ELASTICSEARCH"),
            &["agent"],
        ));

        let results = reg.matching_sources(&["ELASTICSEARCH".to_string()]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "agent_tool");
    }

    #[test]
    fn test_matching_sources_dockit_always_included() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap(
            "dockit_tool",
            SourceKind::DocKit,
            &["agent"],
        ));

        let results = reg.matching_sources(&["UNKNOWN_DB".to_string()]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "dockit_tool");
    }

    #[test]
    fn test_matching_sources_empty_db_types() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap(
            "dockit_tool",
            SourceKind::DocKit,
            &["agent"],
        ));
        reg.register(make_cap(
            "es_tool",
            SourceKind::Database("ELASTICSEARCH"),
            &["agent"],
        ));

        let results = reg.matching_sources(&[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "dockit_tool");
    }

    #[test]
    fn test_agent_tools_returns_only_agent_tagged() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap("agent_cap", SourceKind::DocKit, &["agent"]));
        reg.register(make_cap("ui_cap", SourceKind::DocKit, &["ui"]));
        reg.register(make_cap("both_cap", SourceKind::DocKit, &["agent", "ui"]));

        let results = reg.agent_tools();
        assert_eq!(results.len(), 2);
        let names: Vec<_> = results.iter().map(|c| c.name).collect();
        assert!(names.contains(&"agent_cap"));
        assert!(names.contains(&"both_cap"));
        assert!(!names.contains(&"ui_cap"));
    }

    #[test]
    fn test_ui_capabilities_returns_only_ui_tagged() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap("agent_cap", SourceKind::DocKit, &["agent"]));
        reg.register(make_cap("ui_cap", SourceKind::DocKit, &["ui"]));
        reg.register(make_cap("both_cap", SourceKind::DocKit, &["agent", "ui"]));

        let results = reg.ui_capabilities();
        assert_eq!(results.len(), 2);
        let names: Vec<_> = results.iter().map(|c| c.name).collect();
        assert!(names.contains(&"ui_cap"));
        assert!(names.contains(&"both_cap"));
        assert!(!names.contains(&"agent_cap"));
    }

    #[test]
    #[should_panic(expected = "Duplicate capability registration")]
    fn test_register_duplicate_panics() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap("dup_cap", SourceKind::DocKit, &["agent"]));
        reg.register(make_cap("dup_cap", SourceKind::DocKit, &["agent"]));
    }

    #[test]
    fn test_get_existing_and_missing() {
        let mut reg = CapabilityRegistry::new();
        reg.register(make_cap("exists", SourceKind::DocKit, &["agent"]));

        assert!(reg.get("exists").is_some());
        assert!(reg.get("does_not_exist").is_none());
    }
}
