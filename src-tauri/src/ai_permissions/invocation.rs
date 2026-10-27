use super::{load_permission_policy, policy::PolicyAction, scope::AgentAccess, AiPolicy};
use data_studio_agent::{
    capabilities::{
        registry,
        types::{Capability, RiskLevel},
    },
    tool_executor::{ToolCallPreparation, ToolExecutionError},
};
use serde_json::{json, Value};
use tauri::Manager;
use tauri_plugin_store::StoreExt;

struct Authorization {
    policy: AiPolicy,
    risk: RiskLevel,
    confirmation: bool,
    allowed_ids: Option<Vec<String>>,
}

fn authorize(
    name: &str,
    args: &Value,
    config: &Value,
    access: Option<&AgentAccess>,
) -> Result<Authorization, String> {
    let app = crate::APP_HANDLE.get().ok_or("App not initialized")?;
    if let Some(id) = config.get("connectionId").and_then(Value::as_str) {
        let connections = app
            .store(".store.dat")
            .map_err(|e| e.to_string())?
            .get("connections")
            .and_then(|value| value.as_array().cloned())
            .unwrap_or_default();
        if !connections
            .iter()
            .any(|connection| match &connection["id"] {
                Value::String(value) => value == id,
                Value::Number(value) => value.to_string() == id,
                _ => false,
            })
        {
            return Err("Saved connection is no longer available".into());
        }
    }
    let policy = load_permission_policy(app)?;
    let cap = registry::registry().get(name).ok_or("Unknown capability")?;
    let session = access.map(|access| access.current(name)).transpose()?;
    evaluate(policy, cap, args, config, session)
}

fn evaluate(
    policy: AiPolicy,
    cap: &Capability,
    args: &Value,
    config: &Value,
    session: Option<super::scope::SessionAccess>,
) -> Result<Authorization, String> {
    let id = config.get("connectionId").and_then(Value::as_str);
    let restriction = match (id, &session) {
        (Some(id), Some(session)) => Some(
            session
                .restrictions
                .get(id)
                .ok_or("Connection is no longer attached to this conversation")?,
        ),
        _ => None,
    };
    let decision = policy.authorize(cap, args, id, restriction)?;
    let risk = if decision == PolicyAction::Ask {
        RiskLevel::Destructive
    } else {
        cap.risk_level
    };
    let confirmation = session
        .as_ref()
        .map(|session| session.confirmation_required(risk))
        .transpose()?
        .unwrap_or(false);
    let allowed_ids = session.map(|session| {
        session
            .restrictions
            .into_iter()
            .filter_map(|(id, restriction)| {
                let effective = policy.effective_permissions(&id);
                [
                    super::chain::Permission::Read,
                    super::chain::Permission::Create,
                    super::chain::Permission::Update,
                    super::chain::Permission::Delete,
                    super::chain::Permission::Manage,
                ]
                .iter()
                .any(|action| {
                    effective.get(*action) == Some(true)
                        && restriction.get(*action) != Some(false)
                        && (*action != super::chain::Permission::Manage
                            || restriction.manage == Some(true))
                })
                .then_some(id)
            })
            .collect()
    });
    Ok(Authorization {
        policy,
        risk,
        confirmation,
        allowed_ids,
    })
}

pub(crate) fn prepare_agent_call(
    access: &AgentAccess,
    name: &str,
    args: &Value,
    config: &Value,
) -> Result<ToolCallPreparation, String> {
    let authorization = authorize(name, args, config, Some(access)).map_err(|error| {
        super::AccessDenial::from_error(&error)
            .with_context(config)
            .encode()
    })?;
    let mut config = if config.is_object() {
        config.clone()
    } else {
        json!({})
    };
    config["__ai_confirmation_required"] = json!(authorization.confirmation);
    Ok(ToolCallPreparation {
        connection_config: config,
        risk_level: Some(authorization.risk),
        confirmation_required: Some(authorization.confirmation),
    })
}

fn check_confirmation(config: &Value, required: bool) -> Result<(), ToolExecutionError> {
    if required
        && config
            .get("__ai_confirmation_required")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err(ToolExecutionError::ConfirmationRequired);
    }
    Ok(())
}

pub(crate) async fn invoke_ai(
    name: &str,
    args: &Value,
    config: &Value,
    access: Option<&AgentAccess>,
) -> Result<String, ToolExecutionError> {
    let denial = |error: String| {
        ToolExecutionError::Denied(if access.is_some() {
            super::AccessDenial::from_error(&error)
                .with_context(config)
                .encode()
        } else {
            super::display_denial(&error)
        })
    };
    let initial = authorize(name, args, config, access).map_err(&denial)?;
    if access.is_some() {
        check_confirmation(config, initial.confirmation)?;
    }
    let resolved = match config.get("connectionId").and_then(Value::as_str) {
        Some(id) => Some(resolve_connection(id).await?),
        None => None,
    };
    // Resolution can await connection/SSH setup. Revalidate at dispatch after it completes.
    let authorization = authorize(name, args, config, access).map_err(&denial)?;
    if access.is_some() {
        check_confirmation(config, authorization.confirmation)?;
    }
    let raw = registry::invoke_capability_inner(name, args.clone(), resolved).await?;
    if !name.ends_with("__list_connections") {
        return Ok(raw);
    }
    let mut result: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if let Some(connections) = result.get("connections").and_then(Value::as_array) {
        result["connections"] = Value::Array(
            connections
                .iter()
                .filter(|connection| {
                    let id = match &connection["id"] {
                        Value::String(id) => id.clone(),
                        Value::Number(id) => id.to_string(),
                        _ => return false,
                    };
                    authorization
                        .policy
                        .effective_permissions(&id)
                        .any_allowed()
                        && authorization
                            .allowed_ids
                            .as_ref()
                            .is_none_or(|ids| ids.contains(&id))
                })
                .cloned()
                .collect(),
        );
    }
    Ok(result.to_string())
}

async fn resolve_connection(id: &str) -> Result<Value, String> {
    let app = crate::APP_HANDLE.get().ok_or("App not initialized")?;
    let mut config = crate::common::connection_resolver::ConnectionResolver::resolve(app, id)?;
    crate::common::ssh_bridge::resolve_ssh_in_place(app, &mut config).await?;
    Ok(config)
}
fn read_tool(config: &Value) -> &'static str {
    match config.get("dbType").and_then(Value::as_str) {
        Some("MONGODB") => "mongo__list_databases",
        Some("DYNAMODB") => "dynamo__list_tables",
        _ => "es__cat_indices",
    }
}

#[tauri::command]
pub async fn get_ai_context(
    session_id: String,
    connections: std::collections::HashMap<String, Value>,
    context_kind: String,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    crate::entitlement::ensure_local_ultimate(
        &app.state::<crate::entitlement::EntitlementState>(),
        "AI",
    )?;
    let studio = match context_kind.as_str() {
        "dataStudio" => true,
        "sidebarAssistant" => false,
        _ => return Err("Unknown AI context".into()),
    };
    let access = AgentAccess {
        session_id,
        connections,
        studio,
        db: app
            .state::<data_studio_agent::storage::db::AgentDb>()
            .inner()
            .clone(),
    };
    let mut readable = Vec::new();
    let schemas: Vec<String> = Vec::new();
    for (alias, config) in &access.connections {
        let Some(id) = config.get("connectionId").and_then(Value::as_str) else {
            continue;
        };
        if readable.iter().any(|value| value == id) {
            continue;
        }
        if authorize(read_tool(config), &json!({}), config, Some(&access)).is_err() {
            continue;
        }
        let _ = alias;
        readable.push(id.to_owned());
    }
    let policy = load_permission_policy(&app)?;
    let session = access.current("")?;
    let effective_permissions =
        connection_permission_context(&policy, &access.connections, &session.restrictions);
    Ok(
        json!({"readableConnectionIds": readable, "schema": schemas.join("\n"), "effectivePermissions": effective_permissions}),
    )
}

fn connection_permission_context(
    policy: &AiPolicy,
    connections: &std::collections::HashMap<String, Value>,
    restrictions: &std::collections::HashMap<String, super::PermissionRules>,
) -> std::collections::HashMap<String, super::PermissionRules> {
    connections
        .iter()
        .filter_map(|(alias, config)| {
            let id = config["connectionId"].as_str()?;
            let restriction = restrictions.get(id)?;
            let effective = policy.effective_permissions(id);
            let allowed = |action| {
                effective.get(action) == Some(true)
                    && restriction.get(action) != Some(false)
                    && (action != super::chain::Permission::Manage
                        || restriction.manage == Some(true))
            };
            use super::chain::Permission::{Create, Delete, Manage, Read, Update};
            Some((
                alias.clone(),
                super::PermissionRules::explicit(
                    allowed(Read),
                    allowed(Create),
                    allowed(Update),
                    allowed(Delete),
                    allowed(Manage),
                ),
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::{
        scope::{ConfirmationRuleAction, SessionAccess},
        PermissionRules,
    };
    use super::*;
    use data_studio_agent::capabilities::types::{Capability, CapabilityHandler, SourceKind};
    use std::{collections::HashMap, sync::Arc};

    struct NeverExecute;
    #[async_trait::async_trait]
    impl CapabilityHandler for NeverExecute {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            panic!("authorization must not execute a capability")
        }
    }
    fn cap() -> Capability {
        Capability {
            name: "sqlkit__execute_write",
            required_permission: "create",
            source_kind: SourceKind::SqlDatabase,
            risk_level: RiskLevel::Elevated,
            handler: Arc::new(NeverExecute),
            description: "",
            input_schema: json!({}),
            tags: &["agent"],
            parallel_ok: false,
        }
    }
    fn policy() -> AiPolicy {
        AiPolicy {
            permission_defaults: Some(PermissionRules::explicit(true, true, true, true, true)),
            ..Default::default()
        }
    }
    fn session() -> SessionAccess {
        SessionAccess {
            restrictions: HashMap::from([(
                "42".into(),
                PermissionRules::explicit(true, true, true, true, true),
            )]),
            mode: "Auto".into(),
            rule: None,
        }
    }
    #[test]
    fn connection_revocation_denies_even_after_successful_preflight() {
        let cap = cap();
        let config = json!({"connectionId":"42"});
        let args = json!({"sql":"UPDATE t SET x=1"});
        let mut policy = policy();
        assert!(evaluate(policy.clone(), &cap, &args, &config, Some(session())).is_ok());
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                update: Some(false),
                ..Default::default()
            },
        );
        assert!(evaluate(policy, &cap, &args, &config, Some(session())).is_err());
    }
    #[test]
    fn confirmation_never_bypasses_connection_or_conversation_denial() {
        let config = json!({"connectionId":"42","__ai_confirmation_required":true});
        let mut session = session();
        session.rule = Some(ConfirmationRuleAction::AllowAlways);
        session.restrictions.get_mut("42").unwrap().update = Some(false);
        assert!(evaluate(
            policy(),
            &cap(),
            &json!({"sql":"UPDATE t SET x=1"}),
            &config,
            Some(session)
        )
        .is_err());
    }
    #[test]
    fn always_allow_never_bypasses_connection_denial() {
        let mut session = session();
        session.rule = Some(ConfirmationRuleAction::AllowAlways);
        let mut policy = policy();
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                update: Some(false),
                ..Default::default()
            },
        );
        assert!(evaluate(
            policy,
            &cap(),
            &json!({"sql":"UPDATE t SET x=1"}),
            &json!({"connectionId":"42","__ai_confirmation_required":true}),
            Some(session)
        )
        .is_err());
    }
    #[test]
    fn scripted_elasticsearch_calls_require_destructive_confirmation_in_auto_mode() {
        for (name, args) in [
            (
                "es__update_document",
                json!({"body":{"script":{"id":"stored-update"}}}),
            ),
            (
                "es__bulk",
                json!({"body":"{\"update\":{\"_id\":\"1\"}}\n{\"script\":\"ctx.op = 'delete'\"}\n"}),
            ),
            (
                "es__reindex",
                json!({"body":{"source":{"index":"source"}, "dest":{"index":"target"}, "script":{"source":"ctx.op = 'delete'"}}}),
            ),
        ] {
            let mut cap = cap();
            cap.name = name;
            cap.required_permission = if name == "es__update_document" {
                "update"
            } else {
                "create"
            };
            cap.source_kind = SourceKind::Database("ELASTICSEARCH");
            let config = json!({"connectionId":"42","__ai_confirmation_required":false});
            let decision = evaluate(policy(), &cap, &args, &config, Some(session())).unwrap();
            assert_eq!(decision.risk, RiskLevel::Destructive);
            assert!(decision.confirmation);
            assert_eq!(
                check_confirmation(&config, decision.confirmation),
                Err(ToolExecutionError::ConfirmationRequired)
            );
        }
    }
    #[test]
    fn unbound_targets_are_denied_but_mcp_has_no_conversation_attachment_requirement() {
        let config = json!({"connectionId":"99"});
        let args = json!({"sql":"UPDATE t SET x=1"});
        assert!(evaluate(policy(), &cap(), &args, &config, Some(session())).is_err());
        assert!(evaluate(policy(), &cap(), &args, &config, None).is_ok());
    }
    #[test]
    fn payload_controls_confirmation_and_all_required_actions() {
        let args = json!({"sql":"INSERT INTO t VALUES(1); DELETE FROM t"});
        let config = json!({"connectionId":"42"});
        let decision = evaluate(policy(), &cap(), &args, &config, Some(session())).unwrap();
        assert_eq!(decision.risk, RiskLevel::Destructive);
        assert!(decision.confirmation);
        let mut policy = policy();
        policy.connection_permissions.insert(
            "42".into(),
            PermissionRules {
                delete: Some(false),
                ..Default::default()
            },
        );
        assert!(evaluate(policy, &cap(), &args, &config, Some(session())).is_err());
    }
    #[test]
    fn stricter_confirmation_requires_renewed_approval() {
        assert!(check_confirmation(&json!({"__ai_confirmation_required":false}), false).is_ok());
        assert_eq!(
            check_confirmation(&json!({"__ai_confirmation_required":false}), true),
            Err(ToolExecutionError::ConfirmationRequired)
        );
        assert!(check_confirmation(&json!({"__ai_confirmation_required":true}), true).is_ok());
    }
    #[test]
    fn discovery_is_limited_to_current_scope_and_effective_actions() {
        let mut cap = cap();
        cap.name = "app__list_connections";
        cap.source_kind = SourceKind::AppLocal;
        let mut session = session();
        session.restrictions.insert(
            "42".into(),
            PermissionRules::explicit(false, false, false, false, false),
        );
        assert!(
            evaluate(policy(), &cap, &json!({}), &Value::Null, Some(session))
                .unwrap()
                .allowed_ids
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn refreshed_context_follows_connection_grants_and_current_conversation_limits() {
        let connections = HashMap::from([("example".into(), json!({"connectionId":"42"}))]);
        let mut policy = policy();
        policy.permission_defaults =
            Some(PermissionRules::explicit(true, true, true, false, false));
        let mut restrictions = session().restrictions;
        let initial = connection_permission_context(&policy, &connections, &restrictions);
        assert_eq!(initial["example"].manage, Some(false));
        let saved = serde_json::to_string(&PermissionRules::explicit(true, true, true, true, true))
            .unwrap();
        policy
            .connection_permissions
            .insert("42".into(), serde_json::from_str(&saved).unwrap());
        let refreshed = connection_permission_context(&policy, &connections, &restrictions);
        assert_eq!(refreshed["example"].manage, Some(true));
        assert_eq!(refreshed["example"].delete, Some(true));
        restrictions.get_mut("42").unwrap().manage = Some(false);
        assert_eq!(
            connection_permission_context(&policy, &connections, &restrictions)["example"].manage,
            Some(false)
        );
        restrictions.clear();
        assert!(connection_permission_context(&policy, &connections, &restrictions).is_empty());
    }
}
