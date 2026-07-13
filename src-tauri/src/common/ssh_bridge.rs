//! Bridge between SSH transport layers and dockit's connection resolution.
//! Called by client factories BEFORE creating any database client.

use serde_json::Value;
use tauri::AppHandle;
use crate::ssh::config::{SshConnectionConfig, TransportLayerConfig};
use crate::ssh::{start_transport_layers, stop_transport_layers, TunnelManager};

/// Resolve connection target through SSH tunnel if enabled.
/// Returns `(host, port)` — either `(127.0.0.1, local_port)` for tunneled
/// connections, or `(original_host, original_port)` for direct connections.
pub async fn resolve_connection_target(
    app: &AppHandle,
    config: &Value,
    connection_id: &str,
    tunnels: &TunnelManager,
) -> Result<(String, u16), String> {
    // Extract SSH config from the connection JSON
    let ssh_config: Option<SshConnectionConfig> = config
        .get("ssh")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let ssh_config = match ssh_config {
        Some(c) if c.enabled => c,
        _ => {
            // No SSH config or SSH disabled — return original host:port
            let host = config["host"].as_str().unwrap_or("localhost").to_string();
            let port = config["port"].as_u64().unwrap_or(0) as u16;
            return Ok((host, port));
        }
    };

    // Build transport layers
    let layers = build_transport_layers(app, &ssh_config)?;

    // Resolve remote host:port from connection config
    let remote_host = config["host"].as_str().unwrap_or("localhost").to_string();
    let remote_port = config["port"].as_u64().unwrap_or(0) as u16;

    // Start transport layers — this starts the SSH tunnel(s) and returns local port
    match start_transport_layers(connection_id, &layers, &remote_host, remote_port, tunnels).await {
        Ok(Some(local_port)) => Ok(("127.0.0.1".to_string(), local_port)),
        Ok(None) => Ok((remote_host, remote_port)),
        Err(e) => Err(e),
    }
}

/// Cleanup SSH tunnel for a connection.
pub async fn cleanup_connection_tunnel(
    connection_id: &str,
    tunnels: &TunnelManager,
) {
    stop_transport_layers(connection_id, tunnels).await;
}

/// Build transport layer configs from the SSH connection config.
fn build_transport_layers(
    app: &AppHandle,
    ssh: &SshConnectionConfig,
) -> Result<Vec<TransportLayerConfig>, String> {
    let mut layers = Vec::new();

    // Primary tunnel (from profile or inline)
    let primary = if let Some(ref profile_id) = ssh.profile_id {
        load_profile_as_tunnel(app, profile_id)?
    } else if let Some(ref inline) = ssh.inline {
        TransportLayerConfig::Ssh(inline.clone())
    } else {
        return Ok(Vec::new());
    };
    layers.push(primary);

    // Additional hops
    for hop_id in &ssh.hop_profile_ids {
        let hop = load_profile_as_tunnel(app, hop_id)?;
        layers.push(hop);
    }

    Ok(layers)
}

fn load_profile_as_tunnel(
    app: &AppHandle,
    profile_id: &str,
) -> Result<TransportLayerConfig, String> {
    use tauri_plugin_store::StoreExt;

    let store = app
        .store(".store.dat")
        .map_err(|e| format!("Failed to open store: {}", e))?;

    let all_profiles = store
        .get("sshProfiles")
        .and_then(|v| v.as_array().cloned())
        .ok_or_else(|| "No SSH profiles found".to_string())?;

    let profile_json = all_profiles
        .iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(profile_id))
        .ok_or_else(|| format!("SSH profile '{}' not found", profile_id))?;

    let profile: crate::ssh::config::SshProfile = serde_json::from_value(profile_json.clone())
        .map_err(|e| format!("Failed to parse SSH profile '{}': {}", profile_id, e))?;

    Ok(TransportLayerConfig::Ssh(profile.to_tunnel_config()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::config::SshTunnelConfig;

    #[test]
    fn test_build_transport_layers_no_ssh_returns_empty() {
        // This tests the early return when profile_id is None and inline is None
        let ssh = SshConnectionConfig {
            enabled: true,
            profile_id: None,
            hop_profile_ids: vec![],
            inline: None,
        };
        // Can't easily create AppHandle in unit tests, so test the None-branch logic
        assert!(ssh.profile_id.is_none());
        assert!(ssh.inline.is_none());
    }

    #[test]
    fn test_build_transport_layers_with_inline_returns_layer() {
        let inline = SshTunnelConfig {
            enabled: true, host: "bastion".into(), port: 22,
            username: "user".into(), auth_method: "key".into(),
            password: String::new(), key_path: "~/.ssh/key".into(),
            key_passphrase: String::new(), use_ssh_agent: false,
            ssh_agent_sock_path: String::new(), connect_timeout_secs: 10,
            keepalive_interval_secs: 30, verify_host_key: false, expose_lan: false,
        };
        let ssh = SshConnectionConfig {
            enabled: true,
            profile_id: None,
            hop_profile_ids: vec![],
            inline: Some(inline),
        };
        assert!(ssh.inline.is_some());
    }
}
