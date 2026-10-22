mod chain;
mod policy;

pub(crate) use chain::PermissionRules;
pub(crate) use policy::AiPolicy;
#[cfg(test)]
pub(crate) use policy::{ConnectionMcpOverride, McpPermissionMode};

use crate::mcp_bridge::McpConfig;
use data_studio_agent::capabilities::{
    registry,
    types::{Capability, RiskLevel},
};
use data_studio_agent::tool_executor::ToolCallPreparation;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

pub(crate) static AI_POLICY_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub(crate) fn load_permission_policy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<AiPolicy, String> {
    let _guard = AI_POLICY_LOCK.lock().map_err(|e| e.to_string())?;
    load_permission_policy_inner(app)
}

pub(crate) fn read_permission_config(dir: &Path) -> Result<McpConfig, String> {
    Ok(match std::fs::read_to_string(dir.join("mcp-config.json")) {
        Ok(raw) => {
            serde_json::from_str(&raw).map_err(|e| format!("Cannot load AI permissions: {e}"))?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => McpConfig::default(),
        Err(error) => return Err(format!("Cannot load AI permissions: {error}")),
    })
}

fn load_permission_policy_inner<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<AiPolicy, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut config = read_permission_config(&dir)?;
    if config.policy.permission_defaults.is_none() {
        let store = app.store(".store.dat").map_err(|e| e.to_string())?;
        let ids = store
            .get("connections")
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default()
            .iter()
            .filter_map(|c| {
                c.get("id").and_then(|id| match id {
                    Value::String(id) => Some(id.clone()),
                    Value::Number(id) => Some(id.to_string()),
                    _ => None,
                })
            })
            .collect::<Vec<_>>();
        config.policy.migrate_permissions(&ids);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        config.save(&dir)?;
    }
    Ok(config.policy)
}

#[tauri::command]
pub fn get_ai_permissions(app: AppHandle) -> Result<AiPolicy, String> {
    load_permission_policy(&app)
}

#[tauri::command]
pub fn save_ai_permissions(
    defaults: Option<PermissionRules>,
    connection_id: Option<String>,
    permissions: Option<PermissionRules>,
    app: AppHandle,
) -> Result<AiPolicy, String> {
    let _guard = AI_POLICY_LOCK.lock().map_err(|e| e.to_string())?;
    let mut policy = load_permission_policy_inner(&app)?;
    if let Some(defaults) = defaults {
        policy.permission_defaults = Some(defaults.resolve(&Default::default()));
    }
    if let Some(id) = connection_id {
        let rules = permissions.unwrap_or_default();
        if rules == Default::default() {
            policy.connection_permissions.remove(&id);
        } else {
            policy.connection_permissions.insert(id, rules);
        }
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut config = read_permission_config(&dir)?;
    config.policy = policy.clone();
    config.save(&dir)?;
    Ok(policy)
}

fn authorize_context(
    policy: &AiPolicy,
    cap: &Capability,
    arguments: &Value,
    config: &Value,
) -> Result<RiskLevel, String> {
    let id = config.get("connectionId").and_then(Value::as_str);
    let restriction = config
        .get("permissions")
        .filter(|v| !v.is_null())
        .map(|v| serde_json::from_value::<PermissionRules>(v.clone()))
        .transpose()
        .map_err(|e| e.to_string())?;
    let decision = policy.authorize(cap, arguments, id, restriction.as_ref())?;
    Ok(if decision == policy::PolicyAction::Ask {
        RiskLevel::Destructive
    } else {
        cap.risk_level
    })
}

pub(crate) fn authorize_tool_call(
    tool_name: &str,
    arguments: &Value,
    config: &Value,
) -> Result<AiPolicy, String> {
    let app = crate::APP_HANDLE.get().ok_or("App not initialized")?;
    let policy = load_permission_policy(app)?;
    let cap = registry::registry()
        .get(tool_name)
        .ok_or("Unknown capability")?;
    authorize_context(&policy, cap, arguments, config)?;
    Ok(policy)
}

fn prepare_with_policy(
    policy: &AiPolicy,
    cap: &Capability,
    arguments: &Value,
    config: &Value,
    connections: &HashMap<String, Value>,
) -> Result<ToolCallPreparation, String> {
    let risk_level = authorize_context(policy, cap, arguments, config)?;
    let connection_config = if cap.name.ends_with("__list_connections") {
        json!({"__allowed_connection_ids": connections.values()
            .filter_map(|cfg| cfg.get("connectionId").and_then(Value::as_str))
            .collect::<Vec<_>>()})
    } else {
        config.clone()
    };
    Ok(ToolCallPreparation {
        connection_config,
        risk_level: Some(risk_level),
    })
}

pub(crate) fn prepare_agent_call(
    tool_name: &str,
    arguments: &Value,
    config: &Value,
    connections: &HashMap<String, Value>,
) -> Result<ToolCallPreparation, String> {
    let app = crate::APP_HANDLE.get().ok_or("App not initialized")?;
    let policy = load_permission_policy(app)?;
    let cap = registry::registry()
        .get(tool_name)
        .ok_or("Unknown capability")?;
    prepare_with_policy(&policy, cap, arguments, config, connections)
}

#[cfg(test)]
mod preparation_tests {
    use super::*;
    use data_studio_agent::capabilities::types::{CapabilityHandler, SourceKind};
    use std::sync::Arc;

    struct NeverExecute;
    #[async_trait::async_trait]
    impl CapabilityHandler for NeverExecute {
        async fn handle(&self, _: &Value, _: Option<&Value>) -> Result<String, String> {
            panic!("preparation must not execute a database request")
        }
    }
    fn capability(
        name: &'static str,
        permission: &'static str,
        source_kind: SourceKind,
    ) -> Capability {
        Capability {
            name,
            required_permission: permission,
            source_kind,
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
    #[test]
    fn preparation_and_execution_share_the_same_gate_and_recheck_changed_permissions() {
        let cap = capability("test__update", "update", SourceKind::Database("MONGODB"));
        let config = json!({"connectionId":"dev"});
        let mut current = policy();
        assert!(prepare_with_policy(&current, &cap, &json!({}), &config, &HashMap::new()).is_ok());
        current.connection_permissions.insert(
            "dev".into(),
            PermissionRules {
                update: Some(false),
                ..Default::default()
            },
        );
        assert!(authorize_context(&current, &cap, &json!({}), &config).is_err());
        assert!(prepare_with_policy(&current, &cap, &json!({}), &config, &HashMap::new()).is_err());
        assert!(prepare_with_policy(
            &policy(),
            &cap,
            &json!({}),
            &json!({"connectionId":"dev","permissions":{"update":false}}),
            &HashMap::new()
        )
        .is_err());
    }
    #[test]
    fn discovery_context_comes_from_attached_connections_instead_of_tool_arguments() {
        let cap = capability("app__list_connections", "none", SourceKind::AppLocal);
        let connections = HashMap::from([("alias".into(), json!({"connectionId":"attached"}))]);
        let prepared = prepare_with_policy(
            &policy(),
            &cap,
            &json!({"__allowed_connection_ids":["unattached"]}),
            &Value::Null,
            &connections,
        )
        .unwrap();
        assert_eq!(
            prepared.connection_config,
            json!({"__allowed_connection_ids":["attached"]})
        );
    }
    #[test]
    fn preparation_returns_payload_derived_confirmation_risk() {
        let cap = capability(
            "mongo__bulk_write",
            "write",
            SourceKind::Database("MONGODB"),
        );
        let prepared = prepare_with_policy(
            &policy(),
            &cap,
            &json!({"operations":[{"op":"delete_many"}]}),
            &json!({"connectionId":"dev"}),
            &HashMap::new(),
        )
        .unwrap();
        assert_eq!(prepared.risk_level, Some(RiskLevel::Destructive));
    }
}
