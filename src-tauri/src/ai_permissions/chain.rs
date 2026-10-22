use super::{policy::PolicyAction, AiPolicy};
use data_studio_agent::capabilities::types::{Capability, RiskLevel, SourceKind};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    Read,
    Create,
    Update,
    Delete,
    Manage,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PermissionRules {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub update: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manage: Option<bool>,
}

impl PermissionRules {
    pub fn get(&self, action: Permission) -> Option<bool> {
        match action {
            Permission::Read => self.read,
            Permission::Create => self.create,
            Permission::Update => self.update,
            Permission::Delete => self.delete,
            Permission::Manage => self.manage,
        }
    }

    pub fn explicit(read: bool, create: bool, update: bool, delete: bool, manage: bool) -> Self {
        Self {
            read: Some(read),
            create: Some(create),
            update: Some(update),
            delete: Some(delete),
            manage: Some(manage),
        }
    }

    pub fn resolve(&self, defaults: &Self) -> Self {
        Self {
            read: Some(self.read.or(defaults.read).unwrap_or(false)),
            create: Some(self.create.or(defaults.create).unwrap_or(false)),
            update: Some(self.update.or(defaults.update).unwrap_or(false)),
            delete: Some(self.delete.or(defaults.delete).unwrap_or(false)),
            manage: Some(self.manage.or(defaults.manage).unwrap_or(false)),
        }
    }

    pub fn any_allowed(&self) -> bool {
        [
            self.read,
            self.create,
            self.update,
            self.delete,
            self.manage,
        ]
        .contains(&Some(true))
    }
}

impl AiPolicy {
    pub fn advertises(&self, cap: &Capability) -> bool {
        if self.permission_defaults.is_none() {
            return self.allows(cap.risk_level, None);
        }
        if matches!(cap.source_kind, SourceKind::AppLocal | SourceKind::File) {
            return true;
        }
        self.connection_permissions
            .keys()
            .map(String::as_str)
            .chain(std::iter::once("__inherited__"))
            .any(|id| {
                let rules = self.effective_permissions(id);
                if cap.name.ends_with("__bulk")
                    || cap.name.ends_with("__bulk_write")
                    || cap.name.ends_with("__transact_write_items")
                {
                    return rules.create == Some(true)
                        || rules.update == Some(true)
                        || rules.delete == Some(true);
                }
                if cap.name.ends_with("__execute_write") {
                    return rules.create == Some(true) || rules.update == Some(true);
                }
                required_permissions(cap, &serde_json::json!({}))
                    .is_ok_and(|actions| actions.iter().all(|a| rules.get(*a) == Some(true)))
            })
    }

    pub fn effective_permissions(&self, id: &str) -> PermissionRules {
        let Some(defaults) = &self.permission_defaults else {
            let read = self.allows(RiskLevel::Safe, Some(id));
            let write = self.allows(RiskLevel::Elevated, Some(id));
            let delete = self.allows(RiskLevel::Destructive, Some(id));
            return PermissionRules::explicit(read, write, write, delete, delete);
        };
        self.connection_permissions
            .get(id)
            .cloned()
            .unwrap_or_default()
            .resolve(defaults)
    }

    /// Freeze legacy exceptions to their effective decisions before retiring the allowlist.
    pub fn migrate_permissions(&mut self, connection_ids: &[String]) {
        if self.permission_defaults.is_some() {
            return;
        }
        let mut migrated = std::collections::HashMap::new();
        for id in connection_ids {
            if !self.allowed_connection_ids.is_empty() || self.connection_overrides.contains_key(id)
            {
                migrated.insert(id.clone(), self.effective_permissions(id));
            }
        }
        let read = self.allows(RiskLevel::Safe, None);
        let write = self.allows(RiskLevel::Elevated, None);
        let delete = self.allows(RiskLevel::Destructive, None);
        self.permission_defaults = Some(PermissionRules::explicit(
            read, write, write, delete, delete,
        ));
        // A legacy allowlist also excluded future connections.
        if !self.allowed_connection_ids.is_empty() {
            self.permission_defaults =
                Some(PermissionRules::explicit(false, false, false, false, false));
        }
        self.connection_permissions = migrated;
        self.allowed_connection_ids.clear();
        self.connection_overrides.clear();
    }

    pub fn authorize(
        &self,
        cap: &Capability,
        args: &Value,
        id: Option<&str>,
        restriction: Option<&PermissionRules>,
    ) -> Result<PolicyAction, String> {
        if matches!(cap.source_kind, SourceKind::AppLocal) {
            return Ok(PolicyAction::Allow);
        }
        if matches!(cap.source_kind, SourceKind::File) {
            return if restriction.and_then(|r| r.read) == Some(false) {
                Err("Read access to this source is denied".into())
            } else {
                Ok(PolicyAction::Allow)
            };
        }
        let id = id.ok_or("A saved connection must be specified for database operations")?;
        let effective = self.effective_permissions(id);
        if !effective.any_allowed() {
            return Err(format!("AI access denied for connection '{id}'"));
        }
        let actions = required_permissions(cap, args)?;
        let requires_confirmation = matches!(cap.risk_level, RiskLevel::Destructive)
            || actions.contains(&Permission::Delete)
            || actions.contains(&Permission::Manage);
        for action in actions {
            if effective.get(action) != Some(true) {
                return Err(format!(
                    "{action:?} access denied for connection '{id}' by AI permissions"
                ));
            }
            if let Some(rules) = restriction {
                if rules.get(action) == Some(false)
                    || (action == Permission::Manage && rules.manage != Some(true))
                {
                    return Err(format!(
                        "{action:?} access denied by conversation permissions"
                    ));
                }
            }
        }
        Ok(if requires_confirmation {
            PolicyAction::Ask
        } else {
            PolicyAction::Allow
        })
    }
}

/// Payload-dependent tools require every action they can perform, rather than using risk as permission.
pub fn required_permissions(cap: &Capability, args: &Value) -> Result<Vec<Permission>, String> {
    let name = cap.name;
    let op = name.rsplit("__").next().unwrap_or(name);
    if op == "bulk" {
        let body = args
            .get("body")
            .and_then(Value::as_str)
            .ok_or("Missing bulk body")?;
        let lines: Vec<&str> = body.lines().filter(|l| !l.trim().is_empty()).collect();
        let mut actions = Vec::new();
        let mut index = 0;
        while index < lines.len() {
            let item: Value =
                serde_json::from_str(lines[index]).map_err(|_| "Invalid bulk action")?;
            let obj = item.as_object().ok_or("Invalid bulk action")?;
            if obj.len() != 1 {
                return Err("Invalid bulk action".into());
            }
            let action = match obj.keys().next().map(String::as_str) {
                Some("create") => Permission::Create,
                Some("index") => {
                    actions.push(Permission::Create);
                    Permission::Update
                }
                Some("update") => Permission::Update,
                Some("delete") => Permission::Delete,
                _ => return Err("Unknown bulk action".into()),
            };
            if action == Permission::Update && index + 1 < lines.len() {
                let document: Value =
                    serde_json::from_str(lines[index + 1]).map_err(|_| "Invalid bulk document")?;
                if document.get("upsert").is_some()
                    || document.get("doc_as_upsert").and_then(Value::as_bool) == Some(true)
                    || document.get("scripted_upsert").and_then(Value::as_bool) == Some(true)
                {
                    actions.push(Permission::Create);
                }
            }
            actions.push(action);
            index += if action == Permission::Delete { 1 } else { 2 };
            if index > lines.len() {
                return Err("Missing bulk document".into());
            }
        }
        return Ok(actions);
    }
    if op == "bulk_write" || op == "transact_write_items" {
        let field = if op == "bulk_write" {
            "operations"
        } else {
            "transact_items"
        };
        let raw = args.get(field).ok_or("Missing batch operations")?;
        let parsed = if let Some(text) = raw.as_str() {
            serde_json::from_str::<Value>(text).map_err(|e| e.to_string())?
        } else {
            raw.clone()
        };
        let items = parsed
            .as_array()
            .ok_or("Batch operations must be an array")?;
        let mut actions = Vec::new();
        for item in items {
            let operation = item
                .get("op")
                .and_then(Value::as_str)
                .ok_or("Missing batch operation type")?;
            match operation {
                "put" => actions.extend([Permission::Create, Permission::Update]),
                "insert_one" => actions.push(Permission::Create),
                "update" => actions.extend([Permission::Create, Permission::Update]),
                "update_one" | "update_many" | "replace_one" => {
                    actions.push(Permission::Update);
                    if item.get("upsert").and_then(Value::as_bool) == Some(true) {
                        actions.push(Permission::Create);
                    }
                }
                "delete" | "delete_one" | "delete_many" => actions.push(Permission::Delete),
                _ => return Err("Unsupported batch operation type".into()),
            }
        }
        return Ok(actions);
    }
    if name.starts_with("dynamo__") && (op == "batch_write_items" || op == "update_item") {
        return Ok(vec![Permission::Create, Permission::Update]);
    }
    if cap.required_permission == "update"
        && (args.get("upsert").and_then(Value::as_bool) == Some(true)
            || args.pointer("/options/upsert").and_then(Value::as_bool) == Some(true)
            || args.pointer("/body/doc_as_upsert").and_then(Value::as_bool) == Some(true)
            || args.pointer("/body/upsert").is_some())
    {
        return Ok(vec![Permission::Create, Permission::Update]);
    }
    if op == "reindex" {
        return Ok(vec![
            Permission::Read,
            Permission::Create,
            Permission::Update,
        ]);
    }
    if [
        "update_ttl",
        "update_pitr",
        "update_streams",
        "tag_resource",
        "untag_resource",
        "create_gsi",
        "update_gsi",
        "delete_gsi",
        "create_backup",
        "delete_backup",
        "rename_collection",
        "clone_collection",
    ]
    .contains(&op)
    {
        return Ok(vec![Permission::Manage]);
    }
    if op == "aggregate" {
        let text = args.get("pipeline").unwrap_or(&Value::Null).to_string();
        return Ok(
            if text.contains("\"$out\"") || text.contains("\"$merge\"") {
                vec![
                    Permission::Read,
                    Permission::Create,
                    Permission::Update,
                    Permission::Manage,
                ]
            } else {
                vec![Permission::Read]
            },
        );
    }
    if op == "execute_write" {
        use sqlparser::keywords::Keyword;
        use sqlparser::tokenizer::{Token, Tokenizer};
        let sql = args
            .get("sql")
            .or_else(|| args.get("statement"))
            .and_then(Value::as_str)
            .ok_or("Missing SQL statement")?;
        let tokens = Tokenizer::new(&sqlparser::dialect::GenericDialect {}, sql)
            .tokenize()
            .map_err(|e| e.to_string())?;
        let mut actions = Vec::new();
        for token in tokens {
            if let Token::Word(word) = token {
                if word.quote_style.is_some() {
                    continue;
                }
                match word.keyword {
                    Keyword::INSERT => actions.push(Permission::Create),
                    Keyword::UPDATE => actions.push(Permission::Update),
                    Keyword::DELETE => actions.push(Permission::Delete),
                    Keyword::MERGE => {
                        actions.push(Permission::Create);
                        actions.push(Permission::Update);
                        actions.push(Permission::Delete);
                    }
                    _ => {}
                }
            }
        }
        if actions.is_empty() {
            return Err("No supported SQL write operation".into());
        }
        return Ok(actions);
    }
    if op == "index_document"
        || op == "create_item" && args.get("skip_existing").and_then(Value::as_bool) != Some(true)
    {
        return Ok(vec![Permission::Create, Permission::Update]);
    }
    if [
        "index",
        "table",
        "collection",
        "database",
        "mapping",
        "alias",
        "snapshot",
        "repository",
        "privilege",
        "session",
        "user",
        "role",
    ]
    .iter()
    .any(|object| {
        (op.starts_with("create_")
            || op.starts_with("delete_")
            || op.starts_with("drop_")
            || op.starts_with("put_")
            || op.starts_with("update_")
            || op.starts_with("restore_")
            || op.starts_with("grant_")
            || op.starts_with("revoke_")
            || op.starts_with("kill_"))
            && op.contains(object)
    }) {
        return Ok(vec![Permission::Manage]);
    }
    match cap.required_permission {
        "read" => Ok(vec![Permission::Read]),
        "create" => Ok(vec![Permission::Create]),
        "update" => Ok(vec![Permission::Update]),
        "delete" => Ok(vec![Permission::Delete]),
        "manage" => Ok(vec![Permission::Manage]),
        "write" => Ok(vec![Permission::Create, Permission::Update]),
        "none" if matches!(cap.source_kind, SourceKind::AppLocal) => Ok(vec![]),
        _ => Err("Capability has no supported permission classification".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_each_action_independently() {
        let defaults = PermissionRules::explicit(true, true, true, false, false);
        let rules = PermissionRules {
            update: Some(false),
            delete: Some(true),
            ..Default::default()
        };
        assert_eq!(
            rules.resolve(&defaults),
            PermissionRules::explicit(true, true, false, true, false)
        );
        assert_eq!(
            PermissionRules::default().resolve(&PermissionRules::default()),
            PermissionRules::explicit(false, false, false, false, false)
        );
    }
    #[test]
    fn migration_preserves_allowlist_exclusions_and_future_default() {
        let mut policy = AiPolicy {
            allowed_connection_ids: vec!["dev".into()],
            ..Default::default()
        };
        let before = policy.effective_permissions("dev");
        policy.migrate_permissions(&["dev".into(), "prod".into()]);
        assert_eq!(policy.effective_permissions("dev"), before);
        assert!(!policy.effective_permissions("prod").any_allowed());
        assert!(!policy.effective_permissions("new").any_allowed());
        assert!(policy.allowed_connection_ids.is_empty());
        let again = policy.clone();
        policy.migrate_permissions(&["dev".into()]);
        assert_eq!(policy, again);
    }
}

#[cfg(test)]
mod authorization_tests {
    use super::*;
    use std::sync::Arc;
    struct NeverExecute;
    #[async_trait::async_trait]
    impl data_studio_agent::capabilities::types::CapabilityHandler for NeverExecute {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            panic!("permission tests must not execute tools")
        }
    }
    fn capability(name: &'static str, permission: &'static str, risk: RiskLevel) -> Capability {
        Capability {
            name,
            required_permission: permission,
            risk_level: risk,
            source_kind: SourceKind::Database("TEST"),
            input_schema: serde_json::json!({}),
            description: "test",
            handler: Arc::new(NeverExecute),
            tags: &["agent"],
            parallel_ok: false,
        }
    }
    fn policy() -> AiPolicy {
        AiPolicy {
            permission_defaults: Some(PermissionRules::explicit(true, false, false, false, false)),
            ..Default::default()
        }
    }
    #[test]
    fn connection_decisions_win_per_action_and_conversation_only_narrows() {
        let mut policy = policy();
        policy.connection_permissions.insert(
            "dev".into(),
            PermissionRules {
                update: Some(true),
                read: Some(false),
                ..Default::default()
            },
        );
        let update = capability("test__update_item", "update", RiskLevel::Elevated);
        let read = capability("test__query", "read", RiskLevel::Safe);
        assert!(policy
            .authorize(&update, &serde_json::json!({}), Some("dev"), None)
            .is_ok());
        assert!(policy
            .authorize(&read, &serde_json::json!({}), Some("dev"), None)
            .is_err());
        let restriction = PermissionRules {
            update: Some(false),
            read: Some(true),
            ..Default::default()
        };
        assert!(policy
            .authorize(
                &update,
                &serde_json::json!({}),
                Some("dev"),
                Some(&restriction)
            )
            .is_err());
        assert!(policy
            .authorize(
                &read,
                &serde_json::json!({}),
                Some("dev"),
                Some(&restriction)
            )
            .is_err());
        assert!(policy
            .authorize(&read, &serde_json::json!({}), Some("other"), None)
            .is_ok());
        assert!(policy
            .authorize(&read, &serde_json::json!({}), None, None)
            .is_err());
    }
    #[test]
    fn explicit_allow_can_override_a_denied_system_default() {
        let mut policy = policy();
        policy.permission_defaults =
            Some(PermissionRules::explicit(false, false, false, false, false));
        policy.connection_permissions.insert(
            "dev".into(),
            PermissionRules {
                read: Some(true),
                ..Default::default()
            },
        );
        let read = capability("test__query", "read", RiskLevel::Safe);
        assert!(policy.advertises(&read));
        assert!(policy
            .authorize(&read, &serde_json::json!({}), Some("dev"), None)
            .is_ok());
        assert!(!policy.effective_permissions("other").any_allowed());
    }
    #[test]
    fn bulk_delete_cannot_hide_behind_a_create_permission() {
        let cap = capability("es__bulk", "create", RiskLevel::Elevated);
        let mut policy = policy();
        policy.permission_defaults =
            Some(PermissionRules::explicit(true, true, true, false, false));
        let args = serde_json::json!({"body": "{\"index\":{\"_id\":\"1\"}}\n{\"x\":1}\n{\"delete\":{\"_id\":\"2\"}}\n"});
        assert!(policy.authorize(&cap, &args, Some("dev"), None).is_err());
        assert!(required_permissions(&cap, &serde_json::json!({"body":"{\"wat\":{}}"})).is_err());
    }
    #[test]
    fn read_aggregation_is_not_a_write_but_output_pipeline_is() {
        let cap = capability("mongo__aggregate", "read", RiskLevel::Elevated);
        assert!(policy()
            .authorize(
                &cap,
                &serde_json::json!({"pipeline":[{"$match":{}}]}),
                Some("dev"),
                None
            )
            .is_ok());
        assert!(policy()
            .authorize(
                &cap,
                &serde_json::json!({"pipeline":[{"$out":"target"}]}),
                Some("dev"),
                None
            )
            .is_err());
    }
    #[test]
    fn data_delete_does_not_grant_schema_management() {
        let mut policy = policy();
        policy.permission_defaults = Some(PermissionRules::explicit(true, true, true, true, false));
        assert!(policy
            .authorize(
                &capability("mongo__delete_many", "delete", RiskLevel::Destructive),
                &serde_json::json!({}),
                Some("dev"),
                None
            )
            .is_ok());
        assert!(policy
            .authorize(
                &capability("mongo__drop_collection", "delete", RiskLevel::Destructive),
                &serde_json::json!({}),
                Some("dev"),
                None
            )
            .is_err());
    }
    #[test]
    fn persistence_preserves_explicit_false_and_inherited_omission() {
        let rules = PermissionRules {
            update: Some(false),
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(&rules).unwrap(),
            serde_json::json!({"update":false})
        );
        assert_eq!(
            serde_json::from_value::<PermissionRules>(serde_json::json!({"update":false})).unwrap(),
            rules
        );
        assert!(
            serde_json::from_value::<PermissionRules>(serde_json::json!({"execute":true})).is_err()
        );
    }
}

#[cfg(test)]
mod mixed_operation_tests {
    use super::*;
    use std::sync::Arc;
    struct Noop;
    #[async_trait::async_trait]
    impl data_studio_agent::capabilities::types::CapabilityHandler for Noop {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            Ok(String::new())
        }
    }
    fn cap(name: &'static str, permission: &'static str) -> Capability {
        Capability {
            name,
            required_permission: permission,
            risk_level: RiskLevel::Elevated,
            source_kind: SourceKind::Database("TEST"),
            input_schema: serde_json::json!({}),
            description: "",
            handler: Arc::new(Noop),
            tags: &["agent"],
            parallel_ok: false,
        }
    }
    #[test]
    fn partiql_ignores_comments_and_string_literals() {
        assert_eq!(
            required_permissions(
                &cap("dynamo__execute_write", "create"),
                &serde_json::json!({"statement":"UPDATE t SET x = 'INSERT' WHERE id=1"})
            )
            .unwrap(),
            vec![Permission::Update]
        );
    }
    #[test]
    fn mongo_and_dynamo_batches_require_every_operation() {
        let mongo = required_permissions(
            &cap("mongo__bulk_write", "write"),
            &serde_json::json!({"operations":[{"op":"insert_one"},{"op":"delete_one"}]}),
        )
        .unwrap();
        assert_eq!(mongo, vec![Permission::Create, Permission::Delete]);
        let dynamo = required_permissions(
            &cap("dynamo__transact_write_items", "create"),
            &serde_json::json!({"transact_items":"[{\"op\":\"put\"},{\"op\":\"delete\"}]"}),
        )
        .unwrap();
        assert_eq!(
            dynamo,
            vec![Permission::Create, Permission::Update, Permission::Delete]
        );
    }
    #[test]
    fn payload_risk_does_not_bypass_confirmation_in_auto_mode() {
        let policy = AiPolicy {
            permission_defaults: Some(PermissionRules::explicit(true, true, true, true, false)),
            ..Default::default()
        };
        let decision = policy
            .authorize(
                &cap("mongo__bulk_write", "write"),
                &serde_json::json!({"operations":[{"op":"delete_many"}]}),
                Some("dev"),
                None,
            )
            .unwrap();
        assert_eq!(decision, PolicyAction::Ask);
    }
}
