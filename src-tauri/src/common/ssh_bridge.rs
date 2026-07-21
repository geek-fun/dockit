//! Bridge between SSH transport layers and dockit's connection resolution.
//! Called by client factories BEFORE creating any database client.

use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;
use crate::ssh::config::{SshConnectionConfig, TransportLayerConfig};
use crate::ssh::{start_transport_layers, TunnelManager};

/// Resolved tunnel endpoint. The tunnel stays alive in TunnelManager
/// until the app exits — callers should NOT clean up after each use.
/// Multiple callers with the same SSH config + remote target share one tunnel.
pub struct TunnelEndpoint {
    pub host: String,
    pub port: u16,
}

/// Build a deterministic tunnel key from SSH config + remote target.
/// Same SSH profile/config + same target → same key → tunnel reused.
fn tunnel_key(ssh: Option<&Value>, host: &str, port: u16) -> String {
    let ssh = match ssh {
        Some(v) => v,
        None => return format!("direct:{}:{}", host, port),
    };

    // profileIds are deterministic — use sorted IDs as key
    if let Some(ids) = ssh.get("profileIds").and_then(|v| v.as_array()) {
        let mut sorted: Vec<&str> = ids.iter().filter_map(|v| v.as_str()).collect();
        sorted.sort();
        return format!("ssh:profiles:{}:{}:{}", sorted.join(","), host, port);
    }

    // Inline config — use host:port:username:authMethod as key
    if let Some(inline) = ssh.get("inline") {
        let ih = inline.get("host").and_then(|v| v.as_str()).unwrap_or("");
        let ip = inline.get("port").and_then(|v| v.as_u64()).unwrap_or(0);
        let iu = inline.get("username").and_then(|v| v.as_str()).unwrap_or("");
        let ia = inline.get("auth_method").and_then(|v| v.as_str()).unwrap_or("");
        return format!("ssh:inline:{}:{}:{}:{}:{}:{}", ih, ip, iu, ia, host, port);
    }

    format!("ssh:unknown:{}:{}", host, port)
}

/// Resolve connection target through SSH tunnel if enabled.
/// Returns `(host, port)` — either `(127.0.0.1, local_port)` for tunneled
/// connections, or `(original_host, original_port)` for direct connections.
pub async fn resolve_connection_target(
    app: &AppHandle,
    config: &Value,
    connection_id: &str,
    tunnels: &TunnelManager,
) -> Result<(String, u16), String> {
    let ssh_config: Option<SshConnectionConfig> = config
        .get("sshTunnel")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let ssh_config = match ssh_config {
        Some(c) if c.enabled => c,
        _ => {
            let host = config["host"].as_str().unwrap_or("localhost").to_string();
            let port = config["port"].as_u64().unwrap_or(0) as u16;
            return Ok((host, port));
        }
    };

    let layers = build_transport_layers(app, &ssh_config)?;
    let remote_host = config["host"].as_str().unwrap_or("localhost").to_string();
    let remote_port = config["port"].as_u64().unwrap_or(0) as u16;

    match start_transport_layers(connection_id, &layers, &remote_host, remote_port, tunnels).await {
        Ok(Some(local_port)) => Ok(("127.0.0.1".to_string(), local_port)),
        Ok(None) => Ok((remote_host, remote_port)),
        Err(e) => Err(e),
    }
}

/// Resolve the SSH tunnel for a connection config in place: when enabled,
/// `host`/`port`/`endpointUrl` are rewritten to the local tunnel endpoint
/// and `sshTunnel` is removed; when disabled, `sshTunnel` is removed.
pub async fn resolve_ssh_in_place(app: &AppHandle, config: &mut Value) -> Result<(), String> {
    let ssh = config.get("sshTunnel").cloned();
    let enabled = ssh
        .as_ref()
        .and_then(|s| s.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        if let Some(obj) = config.as_object_mut() {
            obj.remove("sshTunnel");
        }
        return Ok(());
    }

    let (remote_host, remote_port) = extract_remote_target(config);

    // Read original endpointUrl before mutable borrow
    let has_endpoint_url = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .is_some();
    let scheme = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .and_then(|u| url::Url::parse(u).ok())
        .map(|u| u.scheme().to_string())
        .filter(|s| s == "http" || s == "https")
        .unwrap_or_else(|| "http".to_string());

    let endpoint = resolve_ssh_tunnel(app, ssh.as_ref(), &remote_host, remote_port).await?;
    if let Some(obj) = config.as_object_mut() {
        obj.insert("host".to_string(), serde_json::json!(endpoint.host));
        obj.insert("port".to_string(), serde_json::json!(endpoint.port));
        if has_endpoint_url {
            obj.insert(
                "endpointUrl".to_string(),
                serde_json::json!(format!("{}://{}:{}", scheme, endpoint.host, endpoint.port)),
            );
        }
        obj.remove("sshTunnel");
    }
    Ok(())
}

fn extract_remote_target(config: &Value) -> (String, u16) {
    let obj = match config.as_object() { Some(o) => o, None => return ("localhost".into(), 443) };

    if let (Some(host), Some(port)) = (
        obj.get("host").and_then(|v| v.as_str()),
        obj.get("port").and_then(|v| v.as_u64()),
    ) {
        return (host.to_string(), port as u16);
    }

    if let Some(url_str) = obj.get("endpointUrl").and_then(|v| v.as_str()) {
        if let Ok(parsed) = url::Url::parse(url_str) {
            let host = parsed.host_str().unwrap_or("localhost").to_string();
            let port = parsed.port().unwrap_or(443);
            return (host, port);
        }
    }

    ("localhost".into(), 443)
}

/// Resolve SSH tunnel to a local endpoint. The tunnel stays alive in
/// TunnelManager and is reused for subsequent calls with the same config.
/// Callers use `endpoint.host` / `endpoint.port` and do NOT clean up.
pub async fn resolve_ssh_tunnel(
    app: &AppHandle,
    ssh: Option<&Value>,
    host: &str,
    port: u16,
) -> Result<TunnelEndpoint, String> {
    let ssh_enabled = ssh
        .and_then(|s| s.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !ssh_enabled {
        return Ok(TunnelEndpoint {
            host: host.to_string(),
            port,
        });
    }

    let cid = tunnel_key(ssh, host, port);
    let tunnels: tauri::State<crate::ssh::TunnelManager> = app.state();
    let conn_val = serde_json::json!({
        "host": host,
        "port": port,
        "sshTunnel": ssh,
    });
    let (h, p) = resolve_connection_target(app, &conn_val, &cid, tunnels.inner()).await?;
    Ok(TunnelEndpoint { host: h, port: p })
}

/// Build transport layer configs from the SSH connection config.
/// Each profile_id represents one hop in the chain, processed in order.
fn build_transport_layers(
    app: &AppHandle,
    ssh: &SshConnectionConfig,
) -> Result<Vec<TransportLayerConfig>, String> {
    if !ssh.profile_ids.is_empty() {
        ssh.profile_ids
            .iter()
            .map(|pid| load_profile_as_tunnel(app, pid))
            .collect()
    } else if let Some(ref inline) = ssh.inline {
        Ok(vec![TransportLayerConfig::Ssh(inline.clone())])
    } else {
        Ok(Vec::new())
    }
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
    use serde_json::json;

    #[test]
    fn test_tunnel_key_none_returns_direct() {
        assert_eq!(tunnel_key(None, "localhost", 9200), "direct:localhost:9200");
    }

    #[test]
    fn test_tunnel_key_profile_ids_sorted() {
        let ssh = json!({"profileIds": ["z-pid", "a-pid", "m-pid"]});
        let key = tunnel_key(Some(&ssh), "db.host", 27017);
        assert_eq!(key, "ssh:profiles:a-pid,m-pid,z-pid:db.host:27017");
    }

    #[test]
    fn test_tunnel_key_inline_config() {
        let ssh = json!({
            "inline": {
                "host": "bastion.host",
                "port": 2222,
                "username": "jump-user",
                "auth_method": "key",
            }
        });
        let key = tunnel_key(Some(&ssh), "target.host", 5432);
        assert_eq!(key, "ssh:inline:bastion.host:2222:jump-user:key:target.host:5432");
    }

    #[test]
    fn test_tunnel_key_inline_missing_auth_method_defaults_empty() {
        let ssh = json!({
            "inline": {
                "host": "bastion",
                "port": 22,
                "username": "ubuntu",
            }
        });
        let key = tunnel_key(Some(&ssh), "rds.host", 3306);
        assert_eq!(key, "ssh:inline:bastion:22:ubuntu::rds.host:3306");
    }

    #[test]
    fn test_tunnel_key_unknown_when_no_profile_ids_or_inline() {
        let ssh = json!({"enabled": true});
        let key = tunnel_key(Some(&ssh), "some.host", 8080);
        assert_eq!(key, "ssh:unknown:some.host:8080");
    }

    #[test]
    fn test_tunnel_key_single_profile_id() {
        let ssh = json!({"profileIds": ["single-pid"]});
        let key = tunnel_key(Some(&ssh), "es.host", 9200);
        assert_eq!(key, "ssh:profiles:single-pid:es.host:9200");
    }

    #[test]
    fn test_extract_remote_target_from_host_port() {
        let config = json!({"host": "db.example.com", "port": 5432});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "db.example.com");
        assert_eq!(port, 5432);
    }

    #[test]
    fn test_extract_remote_target_from_endpoint_url() {
        let config = json!({"endpointUrl": "https://my-cluster.us-east-1.es.amazonaws.com:443"});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "my-cluster.us-east-1.es.amazonaws.com");
        assert_eq!(port, 443);
    }

    #[test]
    fn test_extract_remote_target_fallback_defaults() {
        let config = json!({});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "localhost");
        assert_eq!(port, 443);
    }

    #[test]
    fn test_extract_remote_target_endpoint_url_without_port() {
        let config = json!({"endpointUrl": "http://bastion.internal"});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "bastion.internal");
        assert_eq!(port, 443);
    }
}
