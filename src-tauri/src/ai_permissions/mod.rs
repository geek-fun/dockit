mod chain;
mod denial;
pub(crate) use denial::{display_denial, AccessDenial};
pub(crate) mod invocation;
mod policy;
mod scope;
pub(crate) use invocation::{invoke_ai, prepare_agent_call};
pub(crate) use scope::AgentAccess;

pub(crate) use chain::may_require_confirmation;
#[cfg(test)]
pub(crate) use chain::Permission;
pub(crate) use chain::PermissionRules;
pub(crate) use policy::AiPolicy;
#[cfg(test)]
pub(crate) use policy::{ConnectionMcpOverride, McpPermissionMode};

use crate::mcp_bridge::McpConfig;
use serde_json::Value;
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

fn authorize_permission_change(
    access: Result<(), String>,
    defaults: &Option<PermissionRules>,
    connection_id: Option<&str>,
    permissions: &Option<PermissionRules>,
    saved_connections: impl FnOnce() -> Result<Option<Value>, String>,
) -> Result<(), String> {
    if access.is_ok()
        || defaults.is_some()
        || permissions
            .as_ref()
            .is_some_and(|rules| *rules != PermissionRules::default())
    {
        return access;
    }
    let Some(id) = connection_id else {
        return access;
    };
    match saved_connections()? {
        None => Ok(()),
        Some(Value::Array(connections))
            if connections
                .iter()
                .all(|connection| match connection.get("id") {
                    Some(Value::String(saved)) => saved != id,
                    Some(Value::Number(saved)) => saved.to_string() != id,
                    _ => false,
                }) =>
        {
            Ok(())
        }
        _ => access,
    }
}

#[tauri::command]
pub fn save_ai_permissions(
    defaults: Option<PermissionRules>,
    connection_id: Option<String>,
    permissions: Option<PermissionRules>,
    app: AppHandle,
) -> Result<AiPolicy, String> {
    authorize_permission_change(
        crate::entitlement::ensure_local_ultimate(
            &app.state::<crate::entitlement::EntitlementState>(),
            "AI permissions",
        ),
        &defaults,
        connection_id.as_deref(),
        &permissions,
        || {
            let store = app.store(".store.dat").map_err(|e| e.to_string())?;
            Ok(store.get("connections"))
        },
    )?;
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

#[cfg(test)]
mod entitlement_tests {
    use super::*;
    use serde_json::json;

    fn denied() -> Result<(), String> {
        Err(crate::entitlement::entitlement_required_error(
            "AI permissions",
        ))
    }

    #[test]
    fn ultimate_can_edit_defaults_and_connection_decisions_without_cleanup_lookup() {
        assert!(authorize_permission_change(
            Ok(()),
            &Some(PermissionRules::default()),
            Some("saved"),
            &Some(PermissionRules::explicit(true, false, false, false, false)),
            || panic!("editing must not use the cleanup path"),
        )
        .is_ok());
    }

    #[test]
    fn community_cannot_edit_defaults_or_explicit_connection_decisions() {
        assert!(authorize_permission_change(
            denied(),
            &Some(PermissionRules::default()),
            None,
            &None,
            || panic!("denied defaults must not inspect storage"),
        )
        .is_err());
        assert!(authorize_permission_change(
            denied(),
            &None,
            Some("saved"),
            &Some(PermissionRules::explicit(false, false, false, false, false)),
            || panic!("explicit denials are permission edits, not cleanup"),
        )
        .is_err());
        assert!(authorize_permission_change(
            denied(),
            &None,
            Some("new"),
            &Some(PermissionRules::explicit(true, false, false, false, false)),
            || panic!("new connection permissions also require Ultimate"),
        )
        .is_err());
    }

    #[test]
    fn community_cannot_reset_a_saved_connections_permissions() {
        for (id, connections) in [
            ("saved", json!([{"id":"saved"}])),
            ("42", json!([{"id":42}])),
        ] {
            let error = authorize_permission_change(
                denied(),
                &None,
                Some(id),
                &Some(PermissionRules::default()),
                || Ok(Some(connections)),
            )
            .unwrap_err();
            assert!(error.contains("ENTITLEMENT_REQUIRED"));
        }
    }

    #[test]
    fn community_can_only_cleanup_decisions_for_deleted_connections() {
        assert!(authorize_permission_change(
            denied(),
            &None,
            Some("deleted"),
            &Some(PermissionRules::default()),
            || Ok(Some(json!([{"id":"retained"}]))),
        )
        .is_ok());
        assert!(
            authorize_permission_change(denied(), &None, Some("last-deleted"), &None, || Ok(None),)
                .is_ok()
        );
    }

    #[test]
    fn unreadable_or_malformed_connections_do_not_authorize_cleanup() {
        for connections in [
            json!({}),
            json!([{"name":"missing-id"}]),
            json!([{"id":null}]),
        ] {
            assert!(
                authorize_permission_change(denied(), &None, Some("saved"), &None, || Ok(Some(
                    connections
                )),)
                .is_err()
            );
        }
        assert!(
            authorize_permission_change(denied(), &None, Some("saved"), &None, || Err(
                "Storage unavailable".into()
            ),)
            .is_err()
        );
    }
}
