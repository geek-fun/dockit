//! Tauri commands for SSH profile management.

use crate::ssh::config::{SshProfile, SshTunnelConfig};
use crate::ssh::ssh_config::read_ssh_config;
use crate::ssh::TunnelManager;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

/// List all saved SSH profiles.
#[tauri::command]
pub async fn list_ssh_profiles(app: AppHandle) -> Result<Vec<SshProfile>, String> {
    let store = app
        .store(".store.dat")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let profiles: Vec<SshProfile> = store
        .get("sshProfiles")
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(profiles)
}

/// Save (create or update) an SSH profile.
/// Returns the profile ID.
#[tauri::command]
pub async fn save_ssh_profile(app: AppHandle, profile: SshProfile) -> Result<SshProfile, String> {
    let store = app
        .store(".store.dat")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let mut profile = profile;
    if profile.id.is_empty() {
        profile.id = Uuid::new_v4().to_string();
    }

    let mut profiles: Vec<SshProfile> = store
        .get("sshProfiles")
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    // Update or insert
    if let Some(pos) = profiles.iter().position(|p| p.id == profile.id) {
        profiles[pos] = profile.clone();
    } else {
        profiles.push(profile.clone());
    }

    store.set(
        "sshProfiles".to_string(),
        serde_json::to_value(&profiles).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(profile)
}

/// Delete an SSH profile by ID.
#[tauri::command]
pub async fn delete_ssh_profile(app: AppHandle, profile_id: String) -> Result<(), String> {
    let store = app
        .store(".store.dat")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let mut profiles: Vec<SshProfile> = store
        .get("sshProfiles")
        .and_then(|v| v.as_array().cloned())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    profiles.retain(|p| p.id != profile_id);

    store.set(
        "sshProfiles".to_string(),
        serde_json::to_value(&profiles).map_err(|e| e.to_string())?,
    );
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Test an SSH connection by creating an ephemeral tunnel.
#[derive(Serialize)]
pub struct TestSshResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub async fn test_ssh_connection(
    config: SshTunnelConfig,
    remote_host: String,
    remote_port: u16,
) -> TestSshResult {
    let tunnels = TunnelManager::new();
    let connection_key = format!("test-{}", Uuid::new_v4());

    match tunnels
        .start_tunnel(&connection_key, &config, &remote_host, remote_port)
        .await
    {
        Ok(_port) => {
            tunnels.stop_tunnel(&connection_key).await;
            TestSshResult {
                success: true,
                message: format!(
                    "SSH connection to {}@{}:{} successful",
                    config.username, config.host, config.port
                ),
            }
        }
        Err(e) => TestSshResult {
            success: false,
            message: e,
        },
    }
}

/// List hosts from ~/.ssh/config.
#[tauri::command]
pub async fn list_ssh_config_hosts(
) -> Result<Vec<crate::ssh::config::SshConfigHostEntry>, String> {
    read_ssh_config()
}
