use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

/// Risk level for a capability — governs whether the UI shows a confirmation
/// dialog before execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,
    Elevated,
    Destructive,
}

/// The kind of source this capability operates on — used by
/// `get_available_tools` to match capabilities to attached connections.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SourceKind {
    /// Database type string, e.g. "ELASTICSEARCH", "DYNAMODB", "MONGODB"
    Database(&'static str),
    /// Reads from local files
    File,
    /// Reads local DocKit application state — no connection config needed
    DocKit,
}

impl SourceKind {
    /// Returns true if this SourceKind matches a database type string
    /// (case-insensitive comparison).
    pub fn matches_db_type(&self, db_type: &str) -> bool {
        match self {
            SourceKind::Database(t) => t.eq_ignore_ascii_case(db_type),
            _ => false,
        }
    }
}

/// A callable handler for a single capability.
///
/// Each capability has exactly one handler. The tool name is implicit in
/// the handler registration — not passed as a parameter.
#[async_trait]
pub trait CapabilityHandler: Send + Sync {
    /// Execute this capability.
    ///
    /// `args` — JSON arguments matching the capability's `input_schema`.
    /// `connection_config` — optional connection configuration (to the
    /// database, file source, etc.). `None` for DocKit environment
    /// capabilities that read local app state.
    async fn handle(&self, args: &Value, connection_config: Option<&Value>) -> Result<String, String>;
}

/// A registered capability — the single definition of an operation
/// that can be consumed by both the UI (via `invoke_capability`) and
/// the agent loop (via tool dispatch).
pub struct Capability {
    pub name: &'static str,
    pub description: &'static str,
    pub handler: Arc<dyn CapabilityHandler>,
    pub input_schema: Value,
    pub risk_level: RiskLevel,
    pub required_permission: &'static str,
    pub source_kind: SourceKind,
    /// Which surfaces expose this capability: "agent", "ui", or both.
    pub tags: &'static [&'static str],
}
