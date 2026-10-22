use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::chain::PermissionRules;
use data_studio_agent::capabilities::types::RiskLevel;

/// Result of a policy decision for a capability invocation.
///
/// `Ask` is informational this iteration: both the MCP bridge and the built-in
/// agent loop execute on `Ask` (confirmation UX is client-driven). Only `Deny`
/// short-circuits execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PolicyAction {
    Allow,
    Ask,
    Deny,
}

/// Permission modes for MCP bridge access.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum McpPermissionMode {
    /// Read-only queries and metadata — only Safe capabilities
    ReadOnly,
    /// Read + write (insert, update, create) — Safe + Elevated
    DataReadWrite,
    /// Everything including destructive ops — Safe + Elevated + Destructive
    FullAccess,
}

impl McpPermissionMode {
    pub fn allows(&self, risk_level: RiskLevel) -> bool {
        match self {
            McpPermissionMode::ReadOnly => matches!(risk_level, RiskLevel::Safe),
            McpPermissionMode::DataReadWrite => {
                matches!(risk_level, RiskLevel::Safe | RiskLevel::Elevated)
            }
            McpPermissionMode::FullAccess => true,
        }
    }
}

/// Per-connection override that takes precedence over the global mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnectionMcpOverride {
    /// Read-only for MCP: blocks Elevated/Destructive regardless of global mode
    pub read_only: bool,
    /// Optional action-level allowlist for this connection.
    /// When set, only capabilities whose risk maps to a listed action pass;
    /// `read_only` remains the coarse legacy gate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub allowed_actions: Option<Vec<McpAction>>,
}

/// Action categories a connection-level override can allow.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum McpAction {
    /// Safe capabilities (queries, metadata)
    Read,
    /// Elevated capabilities (insert, update, create)
    Write,
    /// Destructive capabilities (delete, drop, truncate)
    Delete,
}

impl McpAction {
    pub fn from_risk(risk: RiskLevel) -> McpAction {
        match risk {
            RiskLevel::Safe => McpAction::Read,
            RiskLevel::Elevated => McpAction::Write,
            RiskLevel::Destructive => McpAction::Delete,
        }
    }
}

/// MCP permission policy, stored per app and read by the bridge on every request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AiPolicy {
    #[serde(default)]
    pub permission_defaults: Option<PermissionRules>,
    #[serde(default)]
    pub connection_permissions: HashMap<String, PermissionRules>,
    pub mode: McpPermissionMode,
    /// Empty = all connections allowed; non-empty = only listed connection IDs
    pub allowed_connection_ids: Vec<String>,
    /// Connection-ID-keyed overrides that supersede the global mode
    pub connection_overrides: HashMap<String, ConnectionMcpOverride>,
    /// When true, Destructive capabilities are exposed and gated by mode
    /// (only FullAccess allows them). When false, Destructive is always
    /// hidden/rejected regardless of mode.
    #[serde(default = "default_confirm_destructive")]
    pub confirm_destructive: bool,
}

fn default_confirm_destructive() -> bool {
    true
}

impl Default for AiPolicy {
    fn default() -> Self {
        Self {
            permission_defaults: None,
            connection_permissions: HashMap::new(),
            mode: McpPermissionMode::DataReadWrite,
            allowed_connection_ids: Vec::new(),
            connection_overrides: HashMap::new(),
            confirm_destructive: true,
        }
    }
}

impl AiPolicy {
    pub fn is_connection_allowed(&self, connection_id: &str) -> bool {
        if self.permission_defaults.is_some() {
            return self.effective_permissions(connection_id).any_allowed();
        }
        self.allowed_connection_ids.is_empty()
            || self
                .allowed_connection_ids
                .iter()
                .any(|id| id == connection_id)
    }

    pub fn is_connection_read_only(&self, connection_id: &str) -> bool {
        if self.permission_defaults.is_some() {
            let rules = self.effective_permissions(connection_id);
            return rules.read == Some(true)
                && [rules.create, rules.update, rules.delete, rules.manage]
                    .iter()
                    .all(|v| *v != Some(true));
        }
        self.connection_overrides
            .get(connection_id)
            .is_some_and(|o| o.read_only)
    }

    /// Whether the connection override allows the risk level's action.
    /// Falls back to `read_only` when no action allowlist is set.
    fn connection_allows_action(&self, connection_id: &str, risk: RiskLevel) -> bool {
        let Some(ov) = self.connection_overrides.get(connection_id) else {
            return true;
        };
        match &ov.allowed_actions {
            Some(actions) => actions.contains(&McpAction::from_risk(risk)),
            None => !(ov.read_only && !matches!(risk, RiskLevel::Safe)),
        }
    }

    /// Whether a capability may run for the given connection.
    /// Compat: `allows()` == `decide() != Deny` (Ask counts as allowed).
    pub fn allows(&self, risk_level: RiskLevel, connection_id: Option<&str>) -> bool {
        !matches!(self.decide(risk_level, connection_id), PolicyAction::Deny)
    }

    /// Decide the policy action for a capability and connection.
    pub fn decide(&self, risk_level: RiskLevel, connection_id: Option<&str>) -> PolicyAction {
        if self.permission_defaults.is_some() {
            let rules = self.effective_permissions(connection_id.unwrap_or("__inherited__"));
            let allowed = match risk_level {
                RiskLevel::Safe => rules.read == Some(true),
                RiskLevel::Elevated => {
                    [rules.create, rules.update, rules.manage].contains(&Some(true))
                }
                RiskLevel::Destructive => [rules.delete, rules.manage].contains(&Some(true)),
            };
            return if !allowed {
                PolicyAction::Deny
            } else if matches!(risk_level, RiskLevel::Destructive) {
                PolicyAction::Ask
            } else {
                PolicyAction::Allow
            };
        }
        if let Some(id) = connection_id {
            if !self.is_connection_allowed(id) {
                return PolicyAction::Deny;
            }
            if !self.connection_allows_action(id, risk_level) {
                return PolicyAction::Deny;
            }
        }
        if !self.confirm_destructive && matches!(risk_level, RiskLevel::Destructive) {
            return PolicyAction::Deny;
        }
        if !self.mode.allows(risk_level) {
            return PolicyAction::Deny;
        }
        if matches!(risk_level, RiskLevel::Destructive) && self.confirm_destructive {
            PolicyAction::Ask
        } else {
            PolicyAction::Allow
        }
    }

    /// Human-readable, actionable reason a capability was denied.
    /// Mirrors the `decide()` check order: connection allowlist → override
    /// action → confirm_destructive → mode. Returns None when allowed (or Ask).
    pub fn deny_reason(
        &self,
        risk_level: RiskLevel,
        connection_id: Option<&str>,
    ) -> Option<String> {
        if self.permission_defaults.is_some() {
            return if self.allows(risk_level, connection_id) {
                None
            } else {
                Some("Access denied by the resolved AI permission chain".into())
            };
        }
        if let Some(id) = connection_id {
            if !self.is_connection_allowed(id) {
                return Some(format!(
                    "connection '{id}' is not in the MCP allowlist — add it in Settings → MCP Bridge"
                ));
            }
            if !self.connection_allows_action(id, risk_level) {
                return Some(format!(
                    "connection '{id}' is read-only or lacks the required action — adjust its override in Settings → MCP Bridge"
                ));
            }
        }
        if !self.confirm_destructive && matches!(risk_level, RiskLevel::Destructive) {
            return Some(
                "destructive operations are disabled — enable 'Confirm Destructive Operations' in Settings → MCP Bridge"
                    .into(),
            );
        }
        if !self.mode.allows(risk_level) {
            let required = match risk_level {
                RiskLevel::Safe => McpPermissionMode::ReadOnly,
                RiskLevel::Elevated => McpPermissionMode::DataReadWrite,
                RiskLevel::Destructive => McpPermissionMode::FullAccess,
            };
            return Some(format!(
                "requires {required:?} permission mode — switch it in Settings → MCP Bridge"
            ));
        }
        None
    }

    /// Policy notice appended to every tool description in `tools/list`, so
    /// clients (LLMs) learn what is gated and how to lift the gate without
    /// calling hidden tools (mirrors Neon MCP's read-only notice).
    pub fn policy_notice(&self) -> Option<String> {
        if self.permission_defaults.is_some() {
            return Some("AI permissions are resolved per action: explicit connection decisions take priority over system defaults. Conversation restrictions can only narrow access.".into());
        }
        let mut parts: Vec<String> = Vec::new();
        if !self.mode.allows(RiskLevel::Destructive) || !self.confirm_destructive {
            parts.push(
                "destructive operations (delete/drop/truncate) are hidden — enable Full Access with Confirm Destructive in Settings → MCP Bridge to use them"
                    .into(),
            );
        }
        if !self.mode.allows(RiskLevel::Elevated) {
            parts.push(
                "write operations (insert/update/create) are hidden — enable Data Read/Write or Full Access in Settings → MCP Bridge to use them"
                    .into(),
            );
        }
        if parts.is_empty() {
            None
        } else {
            Some(format!("MCP policy notice: {}", parts.join(" ")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_mode_allows_risk_levels() {
        assert!(McpPermissionMode::ReadOnly.allows(RiskLevel::Safe));
        assert!(!McpPermissionMode::ReadOnly.allows(RiskLevel::Elevated));
        assert!(!McpPermissionMode::ReadOnly.allows(RiskLevel::Destructive));

        assert!(McpPermissionMode::DataReadWrite.allows(RiskLevel::Safe));
        assert!(McpPermissionMode::DataReadWrite.allows(RiskLevel::Elevated));
        assert!(!McpPermissionMode::DataReadWrite.allows(RiskLevel::Destructive));

        assert!(McpPermissionMode::FullAccess.allows(RiskLevel::Safe));
        assert!(McpPermissionMode::FullAccess.allows(RiskLevel::Elevated));
        assert!(McpPermissionMode::FullAccess.allows(RiskLevel::Destructive));
    }

    #[test]
    fn test_default_policy_is_data_read_write_with_all_connections() {
        let policy = AiPolicy::default();
        assert_eq!(policy.mode, McpPermissionMode::DataReadWrite);
        assert!(policy.allowed_connection_ids.is_empty());
        assert!(policy.is_connection_allowed("any-id"));
        assert!(!policy.is_connection_read_only("any-id"));
        // Destructive confirmations are on by default (issue #10)
        assert!(policy.confirm_destructive);
    }

    #[test]
    fn test_confirm_destructive_false_blocks_destructive_even_in_full_access() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: false,
            ..AiPolicy::default()
        };
        // confirm_destructive=false hides Destructive from FullAccess too
        assert!(!policy.allows(RiskLevel::Destructive, None));
        // Safe/Elevated unaffected
        assert!(policy.allows(RiskLevel::Safe, None));
        assert!(policy.allows(RiskLevel::Elevated, None));
    }

    #[test]
    fn test_confirm_destructive_true_allows_destructive_only_in_full_access() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: true,
            ..AiPolicy::default()
        };
        assert!(policy.allows(RiskLevel::Destructive, None));

        let readonly_policy = AiPolicy {
            mode: McpPermissionMode::DataReadWrite,
            confirm_destructive: true,
            ..AiPolicy::default()
        };
        // Mode gate still applies — DataReadWrite blocks Destructive regardless
        assert!(!readonly_policy.allows(RiskLevel::Destructive, None));
    }

    #[test]
    fn test_deny_reason_guides_mode_upgrade() {
        let policy = AiPolicy::default();
        assert_eq!(
            policy.deny_reason(RiskLevel::Destructive, None),
            Some("requires FullAccess permission mode — switch it in Settings → MCP Bridge".into())
        );
        let read_only = AiPolicy {
            mode: McpPermissionMode::ReadOnly,
            ..AiPolicy::default()
        };
        assert_eq!(
            read_only.deny_reason(RiskLevel::Elevated, None),
            Some(
                "requires DataReadWrite permission mode — switch it in Settings → MCP Bridge"
                    .into()
            )
        );
        // Allowed capabilities have no reason
        assert_eq!(policy.deny_reason(RiskLevel::Safe, None), None);
        assert_eq!(policy.deny_reason(RiskLevel::Elevated, None), None);
    }

    #[test]
    fn test_deny_reason_guides_confirm_destructive() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: false,
            ..AiPolicy::default()
        };
        assert_eq!(
            policy.deny_reason(RiskLevel::Destructive, None),
            Some("destructive operations are disabled — enable 'Confirm Destructive Operations' in Settings → MCP Bridge".into())
        );
    }

    #[test]
    fn test_deny_reason_guides_connection_override() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: true,
            allowed_connection_ids: vec!["conn-1".into()],
            connection_overrides: [(
                "conn-1".into(),
                ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]
            .into(),
            ..AiPolicy::default()
        };
        assert_eq!(
            policy.deny_reason(RiskLevel::Safe, Some("conn-2")),
            Some(
                "connection 'conn-2' is not in the MCP allowlist — add it in Settings → MCP Bridge"
                    .into()
            )
        );
        assert_eq!(
            policy.deny_reason(RiskLevel::Elevated, Some("conn-1")),
            Some("connection 'conn-1' is read-only or lacks the required action — adjust its override in Settings → MCP Bridge".into())
        );
        // FullAccess + confirm on + safe connection: no reason
        assert_eq!(policy.deny_reason(RiskLevel::Safe, Some("conn-1")), None);
    }

    #[test]
    fn test_policy_notice_reflects_gated_risks() {
        // Default DataReadWrite hides Destructive → notice mentions it
        let default = AiPolicy::default();
        let notice = default.policy_notice().unwrap();
        assert!(notice.contains("destructive operations"));
        assert!(!notice.contains("write operations"));
        // ReadOnly hides both
        let read_only = AiPolicy {
            mode: McpPermissionMode::ReadOnly,
            ..AiPolicy::default()
        };
        let notice = read_only.policy_notice().unwrap();
        assert!(notice.contains("destructive operations"));
        assert!(notice.contains("write operations"));
        // FullAccess + confirm on hides nothing
        let full = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            confirm_destructive: true,
            ..AiPolicy::default()
        };
        assert_eq!(full.policy_notice(), None);
    }

    #[test]
    fn test_allowlist_restricts_connections() {
        let policy = AiPolicy {
            allowed_connection_ids: vec!["conn-1".into()],
            ..AiPolicy::default()
        };
        assert!(policy.is_connection_allowed("conn-1"));
        assert!(!policy.is_connection_allowed("conn-2"));
        assert!(!policy.allows(RiskLevel::Safe, Some("conn-2")));
    }

    #[test]
    fn test_read_only_override_blocks_elevated_but_allows_safe() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: HashMap::from([(
                "prod-es".into(),
                ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            ..AiPolicy::default()
        };
        assert!(policy.allows(RiskLevel::Destructive, Some("staging-es")));
        assert!(!policy.allows(RiskLevel::Destructive, Some("prod-es")));
        assert!(!policy.allows(RiskLevel::Elevated, Some("prod-es")));
        assert!(policy.allows(RiskLevel::Safe, Some("prod-es")));
    }

    #[test]
    fn test_serde_roundtrip() {
        let policy = AiPolicy {
            mode: McpPermissionMode::DataReadWrite,
            allowed_connection_ids: vec!["conn-1".into()],
            connection_overrides: HashMap::from([(
                "conn-1".into(),
                ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            confirm_destructive: false,
            ..AiPolicy::default()
        };
        let v = serde_json::to_value(&policy).unwrap();
        assert_eq!(v["mode"], "DataReadWrite");
        assert_eq!(v["allowed_connection_ids"][0], "conn-1");
        assert_eq!(v["connection_overrides"]["conn-1"]["read_only"], true);
        assert_eq!(v["confirm_destructive"], false);

        let back: AiPolicy = serde_json::from_value(v).unwrap();
        assert_eq!(back, policy);
    }

    #[test]
    fn test_mode_serde_names() {
        assert_eq!(
            serde_json::to_value(McpPermissionMode::ReadOnly).unwrap(),
            json!("ReadOnly")
        );
        assert_eq!(
            serde_json::to_value(McpPermissionMode::DataReadWrite).unwrap(),
            json!("DataReadWrite")
        );
        assert_eq!(
            serde_json::to_value(McpPermissionMode::FullAccess).unwrap(),
            json!("FullAccess")
        );
    }

    #[test]
    fn test_decide_full_matrix() {
        // mode × risk × confirm_destructive → expected PolicyAction
        let cases: Vec<(McpPermissionMode, RiskLevel, bool, PolicyAction)> = vec![
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Safe,
                true,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Safe,
                false,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Elevated,
                true,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Elevated,
                false,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Destructive,
                true,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::ReadOnly,
                RiskLevel::Destructive,
                false,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Safe,
                true,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Safe,
                false,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Elevated,
                true,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Elevated,
                false,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Destructive,
                true,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::DataReadWrite,
                RiskLevel::Destructive,
                false,
                PolicyAction::Deny,
            ),
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Safe,
                true,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Safe,
                false,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Elevated,
                true,
                PolicyAction::Allow,
            ),
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Elevated,
                false,
                PolicyAction::Allow,
            ),
            // NEW semantic: confirm_destructive=true + Destructive + FullAccess → Ask
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Destructive,
                true,
                PolicyAction::Ask,
            ),
            (
                McpPermissionMode::FullAccess,
                RiskLevel::Destructive,
                false,
                PolicyAction::Deny,
            ),
        ];

        for (mode, risk, confirm, expected) in cases {
            let policy = AiPolicy {
                mode,
                confirm_destructive: confirm,
                ..AiPolicy::default()
            };
            let decided = policy.decide(risk, None);
            assert_eq!(
                decided, expected,
                "decide({mode:?}, {risk:?}, confirm_destructive={confirm}) expected {expected:?} got {decided:?}"
            );
            // Compat invariant: allows() == (decide() != Deny)
            assert_eq!(
                policy.allows(risk, None),
                !matches!(decided, PolicyAction::Deny),
                "allows() must equal (decide() != Deny) for {mode:?}/{risk:?}/{confirm}"
            );
        }
    }

    #[test]
    fn test_decide_connection_overrides() {
        // allowlist excludes a connection → Deny
        let allowlist = AiPolicy {
            allowed_connection_ids: vec!["conn-1".into()],
            ..AiPolicy::default()
        };
        assert_eq!(
            allowlist.decide(RiskLevel::Safe, Some("conn-2")),
            PolicyAction::Deny
        );
        assert_eq!(
            allowlist.decide(RiskLevel::Safe, Some("conn-1")),
            PolicyAction::Allow
        );

        // read-only override blocks Elevated for that connection
        let override_policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: HashMap::from([(
                "prod-es".into(),
                ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            ..AiPolicy::default()
        };
        assert_eq!(
            override_policy.decide(RiskLevel::Elevated, Some("prod-es")),
            PolicyAction::Deny
        );
        assert_eq!(
            override_policy.decide(RiskLevel::Safe, Some("prod-es")),
            PolicyAction::Allow
        );
        assert_eq!(
            override_policy.decide(RiskLevel::Elevated, Some("staging")),
            PolicyAction::Allow
        );
    }

    #[test]
    fn test_policy_action_serde_names() {
        assert_eq!(
            serde_json::to_value(PolicyAction::Allow).unwrap(),
            json!("allow")
        );
        assert_eq!(
            serde_json::to_value(PolicyAction::Ask).unwrap(),
            json!("ask")
        );
        assert_eq!(
            serde_json::to_value(PolicyAction::Deny).unwrap(),
            json!("deny")
        );
    }

    #[test]
    fn test_connection_action_allowlist_blocks_risks() {
        // Read-only action list: only Safe capabilities pass
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: HashMap::from([(
                "prod".into(),
                ConnectionMcpOverride {
                    read_only: false,
                    allowed_actions: Some(vec![McpAction::Read]),
                },
            )]),
            ..AiPolicy::default()
        };
        assert_eq!(
            policy.decide(RiskLevel::Safe, Some("prod")),
            PolicyAction::Allow
        );
        assert_eq!(
            policy.decide(RiskLevel::Elevated, Some("prod")),
            PolicyAction::Deny
        );
        assert_eq!(
            policy.decide(RiskLevel::Destructive, Some("prod")),
            PolicyAction::Deny
        );
    }

    #[test]
    fn test_connection_action_allowlist_read_write() {
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: HashMap::from([(
                "prod".into(),
                ConnectionMcpOverride {
                    read_only: false,
                    allowed_actions: Some(vec![McpAction::Read, McpAction::Write]),
                },
            )]),
            ..AiPolicy::default()
        };
        assert_eq!(
            policy.decide(RiskLevel::Safe, Some("prod")),
            PolicyAction::Allow
        );
        assert_eq!(
            policy.decide(RiskLevel::Elevated, Some("prod")),
            PolicyAction::Allow
        );
        assert_eq!(
            policy.decide(RiskLevel::Destructive, Some("prod")),
            PolicyAction::Deny
        );
    }

    #[test]
    fn test_read_only_legacy_still_works_without_actions() {
        // Legacy read_only override (no allowed_actions) keeps old behavior
        let policy = AiPolicy {
            mode: McpPermissionMode::FullAccess,
            connection_overrides: HashMap::from([(
                "prod".into(),
                ConnectionMcpOverride {
                    read_only: true,
                    allowed_actions: None,
                },
            )]),
            ..AiPolicy::default()
        };
        assert_eq!(
            policy.decide(RiskLevel::Safe, Some("prod")),
            PolicyAction::Allow
        );
        assert_eq!(
            policy.decide(RiskLevel::Elevated, Some("prod")),
            PolicyAction::Deny
        );
        assert!(policy.is_connection_read_only("prod"));
    }

    #[test]
    fn test_mcp_action_serde_names() {
        assert_eq!(
            serde_json::to_value(McpAction::Read).unwrap(),
            json!("read")
        );
        assert_eq!(
            serde_json::to_value(McpAction::Write).unwrap(),
            json!("write")
        );
        assert_eq!(
            serde_json::to_value(McpAction::Delete).unwrap(),
            json!("delete")
        );
        assert_eq!(McpAction::from_risk(RiskLevel::Safe), McpAction::Read);
        assert_eq!(McpAction::from_risk(RiskLevel::Elevated), McpAction::Write);
        assert_eq!(
            McpAction::from_risk(RiskLevel::Destructive),
            McpAction::Delete
        );
    }
}
