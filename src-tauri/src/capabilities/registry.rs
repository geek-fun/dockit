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
