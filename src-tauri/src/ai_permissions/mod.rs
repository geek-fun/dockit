mod chain;
pub(crate) mod invocation;
mod policy;
mod scope;
pub(crate) use invocation::{invoke_ai, prepare_agent_call};
pub(crate) use scope::AgentAccess;

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
