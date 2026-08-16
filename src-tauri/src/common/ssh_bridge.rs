//! Bridge between SSH transport layers and dockit's connection resolution.
//! Called by client factories BEFORE creating any database client.

use crate::ssh::config::{SshConnectionConfig, TransportLayerConfig};
use crate::ssh::{start_transport_layers, TunnelManager};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

/// Resolved tunnel endpoint. The tunnel stays alive in TunnelManager
/// until the app exits — callers should NOT clean up after each use.
/// Multiple callers with the same SSH config + remote target share one tunnel.
pub struct TunnelEndpoint {
    pub host: String,
    pub port: u16,
    /// Local SOCKS5 proxy port when the tunnel runs in Socks5 mode
    /// (drivers keep the real hostname; None = port-forward mode).
    pub socks5_port: Option<u16>,
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
        let iu = inline
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let ia = inline
            .get("auth_method")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        return format!("ssh:inline:{}:{}:{}:{}:{}:{}", ih, ip, iu, ia, host, port);
    }

    format!("ssh:unknown:{}:{}", host, port)
}

/// Resolve connection target through SSH tunnel if enabled.
/// Returns `(host, port, socks5_mode)` — `(127.0.0.1, local_port)` for
/// port-forward, or `(real_host, local_proxy_port, true)` for SOCKS5.
///
/// `force_port_forward` forces port-forward mode for plain-HTTP targets
/// (DynamoDB Local): the AWS SDK sends origin-form HTTP requests (not
/// CONNECT) through an HTTP proxy, which our SOCKS5/CONNECT tunnel cannot
/// forward. force_port_forward (distinct from expose_lan — it does NOT
/// widen the bind address) switches the tunnel to port-forward mode, so
/// the client talks plain HTTP to 127.0.0.1:{local_port} and SSH forwards
/// it. https (ES, AWS DynamoDB) and mongodb:// (Mongo) targets keep
/// SOCKS5/CONNECT.
pub async fn resolve_connection_target(
    app: &AppHandle,
    config: &Value,
    connection_id: &str,
    tunnels: &TunnelManager,
    force_port_forward: bool,
) -> Result<(String, u16, bool), String> {
    let ssh_config: Option<SshConnectionConfig> = config
        .get("sshTunnel")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let ssh_config = match ssh_config {
        Some(c) if c.enabled => c,
        _ => {
            let host = config["host"].as_str().unwrap_or("localhost").to_string();
            let port = config["port"].as_u64().unwrap_or(0) as u16;
            return Ok((host, port, false));
        }
    };

    let layers = build_transport_layers(app, &ssh_config)?;
    let remote_host = config["host"].as_str().unwrap_or("localhost").to_string();
    let remote_port = config["port"].as_u64().unwrap_or(0) as u16;

    // Force the last hop to port-forward mode when the target is plain HTTP.
    let mut layers = layers;
    if force_port_forward {
        if let Some(TransportLayerConfig::Ssh(last)) = layers.last_mut() {
            last.force_port_forward = true;
        }
    }

    // Socks5 only when the last hop is NOT exposed to the LAN: exposeLan
    // forces PortForward (effective_tunnel_mode), so the mode is fully
    // derived from the config — no persisted tunnelMode field.
    let socks5_mode = layers
        .last()
        .map(|layer| match layer {
            TransportLayerConfig::Ssh(c) => !c.expose_lan && !c.force_port_forward,
        })
        .unwrap_or(false);

    match start_transport_layers(connection_id, &layers, &remote_host, remote_port, tunnels).await {
        Ok(Some(local_port)) => {
            if socks5_mode {
                // Socks5 mode: the host stays real (TLS sees it); the port
                // slot carries the LOCAL SOCKS5 listener port so callers can
                // wire the proxy. The real remote port is known by callers.
                Ok((remote_host, local_port, true))
            } else {
                Ok(("127.0.0.1".to_string(), local_port, false))
            }
        }
        Ok(None) => Ok((remote_host, remote_port, false)),
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

    // DynamoDB region-only config: derive the AWS default endpoint so the
    // tunnel targets it and downstream clients read the rewritten local
    // endpoint (capability path otherwise bypasses the tunnel).
    if let Some(derived) = derive_region_endpoint(config) {
        if let Some(obj) = config.as_object_mut() {
            obj.insert("endpointUrl".to_string(), serde_json::json!(derived));
        }
    }

    // Read original endpointUrl before mutable borrow
    let has_endpoint_url = config.get("endpointUrl").and_then(|v| v.as_str()).is_some();
    let scheme = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .and_then(|u| url::Url::parse(u).ok())
        .map(|u| u.scheme().to_string())
        .filter(|s| s == "http" || s == "https")
        .unwrap_or_else(|| "http".to_string());

    // Force port-forward ONLY for DynamoDB plain-HTTP (local) targets.
    // The AWS SDK emits origin-form HTTP (not CONNECT) to a proxy, which our
    // SOCKS5/CONNECT tunnel cannot forward — so route it through a local
    // port-forward. ES and MongoDB never trigger this (gated by `type`),
    // so they keep SOCKS5/CONNECT. https DynamoDB (AWS) also keeps
    // SOCKS5/CONNECT (SigV4 + TLS need the real host). See
    // `force_port_forward_for` and `resolve_connection_target`.
    let force_port_forward = force_port_forward_for(config);

    let endpoint = resolve_ssh_tunnel(
        app,
        ssh.as_ref(),
        &remote_host,
        remote_port,
        force_port_forward,
    )
    .await?;
    let socks5_mode = endpoint.socks5_port.is_some();
    if let Some(obj) = config.as_object_mut() {
        if !socks5_mode {
            obj.insert("host".to_string(), serde_json::json!(endpoint.host));
            obj.insert("port".to_string(), serde_json::json!(endpoint.port));
        }
        if has_endpoint_url && !socks5_mode {
            obj.insert(
                "endpointUrl".to_string(),
                serde_json::json!(format!("{}://{}:{}", scheme, endpoint.host, endpoint.port)),
            );
        }
        if let Some(socks5_port) = endpoint.socks5_port {
            obj.insert(
                "socks5Proxy".to_string(),
                serde_json::json!(format!("127.0.0.1:{}", socks5_port)),
            );
        }
        // Preserve the original remote hostname so TLS clients can keep using
        // it for SNI / certificate validation while TCP goes through the
        // local tunnel endpoint (see execute_es_http / fetch_api). Only when
        // a tunnel is actually established (endpoint host is 127.0.0.1) —
        // otherwise the config still points at the remote host directly.
        let stripped_host = remote_host
            .trim_start_matches("http://")
            .trim_start_matches("https://");
        if (endpoint.host == "127.0.0.1" || endpoint.socks5_port.is_some())
            && !stripped_host.is_empty()
        {
            obj.insert(
                "tunnelOriginalHost".to_string(),
                serde_json::json!(stripped_host),
            );
        }
        obj.remove("sshTunnel");
    }
    Ok(())
}

/// Decide whether to force port-forward tunnel mode for a connection.
///
/// Only DynamoDB plain-HTTP (local) targets need it: the AWS SDK emits
/// origin-form HTTP (not CONNECT) to a proxy, which a SOCKS5 proxy cannot
/// forward, so the client must talk plain HTTP to a local port-forward.
/// `type == "DYNAMODB"` is the primary gate (ES and MongoDB never force),
/// and within DynamoDB only `http://` (Local) forces — `https://` (AWS)
/// keeps SOCKS5/CONNECT so SigV4 signing and TLS see the real host.
/// Mirrors the `endpoint_is_http` check in `dynamo_client::dynamo_test_connection`.
fn force_port_forward_for(config: &Value) -> bool {
    let is_dynamodb = config
        .get("type")
        .and_then(|v| v.as_str())
        .map(|t| t.eq_ignore_ascii_case("DYNAMODB"))
        .unwrap_or(false);
    if !is_dynamodb {
        return false;
    }
    config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .map(|u| u.starts_with("http://"))
        .unwrap_or(false)
}

/// Inverse of the `socks5Proxy` injection in `resolve_ssh_in_place` —
/// ssh_bridge owns both the injection and the parsing of this format.
pub(crate) fn parse_socks5_proxy(
    socks5_proxy: Option<&str>,
) -> Result<Option<(String, u16)>, String> {
    let Some(proxy) = socks5_proxy.filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let (host, port_str) = proxy
        .rsplit_once(':')
        .ok_or_else(|| format!("Invalid socks5Proxy (no port separator): {}", proxy))?;
    let port: u16 = port_str
        .parse()
        .map_err(|e| format!("Invalid socks5Proxy port '{}': {}", port_str, e))?;
    Ok(Some((host.to_string(), port)))
}

pub fn extract_remote_target(config: &Value) -> (String, u16) {
    let obj = match config.as_object() {
        Some(o) => o,
        None => return ("localhost".into(), 443),
    };

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

    // DynamoDB region-only fallback: derive the AWS default endpoint when no
    // host/port/endpointUrl is configured. ES/Mongo never reach here (they
    // always carry host/port and have no `region` field on their config).
    if let Some(region) = obj.get("region").and_then(|v| v.as_str()) {
        if !region.is_empty() {
            return (format!("dynamodb.{}.amazonaws.com", region), 443);
        }
    }

    ("localhost".into(), 443)
}

/// Derive the AWS default DynamoDB endpoint for region-only configs (no
/// host/port/endpointUrl). Returns None for any other config shape.
fn derive_region_endpoint(config: &Value) -> Option<String> {
    let has_host = config
        .get("host")
        .and_then(|v| v.as_str())
        .map(|h| !h.is_empty())
        .unwrap_or(false);
    let has_endpoint = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .map(|u| !u.is_empty())
        .unwrap_or(false);
    if has_host || has_endpoint {
        return None;
    }
    config
        .get("region")
        .and_then(|v| v.as_str())
        .filter(|r| !r.is_empty())
        .map(|region| format!("https://dynamodb.{}.amazonaws.com", region))
}

/// Resolve SSH tunnel to a local endpoint. The tunnel stays alive in
/// TunnelManager and is reused for subsequent calls with the same config.
/// Callers use `endpoint.host` / `endpoint.port` and do NOT clean up.
///
/// `force_port_forward` forces port-forward mode (plain-HTTP targets like
/// DynamoDB Local; see `resolve_connection_target`).
pub async fn resolve_ssh_tunnel(
    app: &AppHandle,
    ssh: Option<&Value>,
    host: &str,
    port: u16,
    force_port_forward: bool,
) -> Result<TunnelEndpoint, String> {
    let ssh_enabled = ssh
        .and_then(|s| s.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !ssh_enabled {
        return Ok(TunnelEndpoint {
            host: host.to_string(),
            port,
            socks5_port: None,
        });
    }

    let cid = tunnel_key(ssh, host, port);
    let tunnels: tauri::State<crate::ssh::TunnelManager> = app.state();
    let conn_val = serde_json::json!({
        "host": host,
        "port": port,
        "sshTunnel": ssh,
    });
    let (h, p, socks5_mode) =
        resolve_connection_target(app, &conn_val, &cid, tunnels.inner(), force_port_forward)
            .await?;
    let socks5_port = if socks5_mode { Some(p) } else { None };
    Ok(TunnelEndpoint {
        // In Socks5 mode h is the real host and p is the LOCAL proxy port;
        // the endpoint port must stay the real remote port for URI building.
        host: h,
        port: if socks5_mode { port } else { p },
        socks5_port,
    })
}

/// Build transport layer configs from the SSH connection config.
/// Each profile_id represents one hop in the chain, processed in order.
fn build_transport_layers(
    app: &AppHandle,
    ssh: &SshConnectionConfig,
) -> Result<Vec<TransportLayerConfig>, String> {
    let mut layers = if !ssh.profile_ids.is_empty() {
        ssh.profile_ids
            .iter()
            .map(|pid| load_profile_as_tunnel(app, pid))
            .collect::<Result<Vec<_>, _>>()?
    } else if let Some(ref inline) = ssh.inline {
        vec![TransportLayerConfig::Ssh(inline.clone())]
    } else {
        Vec::new()
    };
    // The system proxy applies to the first hop only (the local TCP
    // connection to the bastion). `start_chain` forces it off for later hops.
    if ssh.use_system_proxy {
        if let Some(TransportLayerConfig::Ssh(first)) = layers.first_mut() {
            first.use_system_proxy = true;
        }
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
        assert_eq!(
            key,
            "ssh:inline:bastion.host:2222:jump-user:key:target.host:5432"
        );
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
    fn test_extract_remote_target_region_fallback() {
        let config = json!({"region": "us-east-1"});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "dynamodb.us-east-1.amazonaws.com");
        assert_eq!(port, 443);
    }

    #[test]
    fn test_extract_remote_target_region_fallback_skipped_when_host_present() {
        let config = json!({"region": "us-east-1", "host": "es.corp", "port": 9200});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "es.corp");
        assert_eq!(port, 9200);
    }

    #[test]
    fn test_extract_remote_target_region_fallback_skipped_when_endpoint_present() {
        let config = json!({"region": "us-east-1", "endpointUrl": "https://ddb.corp:8000"});
        let (host, port) = extract_remote_target(&config);
        assert_eq!(host, "ddb.corp");
        assert_eq!(port, 8000);
    }

    #[test]
    fn test_derive_region_endpoint_region_only() {
        let config = json!({"region": "us-west-2"});
        assert_eq!(
            derive_region_endpoint(&config).as_deref(),
            Some("https://dynamodb.us-west-2.amazonaws.com")
        );
    }

    #[test]
    fn test_derive_region_endpoint_none_when_host_or_endpoint_present() {
        assert_eq!(derive_region_endpoint(&json!({"host": "h"})), None);
        assert_eq!(
            derive_region_endpoint(&json!({"endpointUrl": "http://x"})),
            None
        );
        assert_eq!(derive_region_endpoint(&json!({"region": ""})), None);
        assert_eq!(derive_region_endpoint(&json!({})), None);
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

    #[test]
    fn test_parse_socks5_proxy_none() {
        assert_eq!(parse_socks5_proxy(None).unwrap(), None);
    }

    #[test]
    fn test_parse_socks5_proxy_empty() {
        assert_eq!(parse_socks5_proxy(Some("")).unwrap(), None);
    }

    #[test]
    fn test_parse_socks5_proxy_default_localhost() {
        assert_eq!(
            parse_socks5_proxy(Some("127.0.0.1:51234")).unwrap(),
            Some(("127.0.0.1".to_string(), 51234))
        );
    }

    #[test]
    fn test_parse_socks5_proxy_custom_host() {
        assert_eq!(
            parse_socks5_proxy(Some("10.0.0.5:1080")).unwrap(),
            Some(("10.0.0.5".to_string(), 1080))
        );
    }

    #[test]
    fn test_parse_socks5_proxy_no_colon() {
        let err = parse_socks5_proxy(Some("invalid")).unwrap_err();
        assert!(err.contains("no port separator"), "got: {}", err);
    }

    #[test]
    fn test_parse_socks5_proxy_bad_port() {
        let err = parse_socks5_proxy(Some("127.0.0.1:abc")).unwrap_err();
        assert!(err.contains("Invalid socks5Proxy port"), "got: {}", err);
    }

    #[test]
    fn test_parse_socks5_proxy_empty_port() {
        assert!(parse_socks5_proxy(Some("127.0.0.1:")).is_err());
    }

    #[test]
    fn test_force_port_forward_for_dynamodb_local_http() {
        assert!(force_port_forward_for(
            &json!({"type": "DYNAMODB", "endpointUrl": "http://localhost:8000"})
        ));
    }

    #[test]
    fn test_force_port_forward_for_dynamodb_aws_https_false() {
        assert!(!force_port_forward_for(
            &json!({"type": "DYNAMODB", "endpointUrl": "https://dynamodb.us-east-1.amazonaws.com"})
        ));
    }

    #[test]
    fn test_force_port_forward_for_dynamodb_case_insensitive_type() {
        assert!(force_port_forward_for(
            &json!({"type": "dynamodb", "endpointUrl": "http://localhost:8000"})
        ));
    }

    #[test]
    fn test_force_port_forward_for_mongo_false() {
        // MongoDB config shape — never force, regardless of endpointUrl.
        assert!(!force_port_forward_for(
            &json!({"type": "MONGODB", "host": "mongo.example.com", "port": 27017, "database": "app"})
        ));
        // Even a Mongo config that happens to carry an http endpointUrl must
        // not force — the MongoDB driver issues CONNECT through a proxy.
        assert!(!force_port_forward_for(
            &json!({"type": "MONGODB", "endpointUrl": "http://mongo.example.com:27017"})
        ));
    }

    #[test]
    fn test_force_port_forward_for_es_false() {
        assert!(!force_port_forward_for(
            &json!({"type": "ELASTICSEARCH", "host": "es.example.com", "port": 9200, "protocol": "https"})
        ));
        assert!(!force_port_forward_for(
            &json!({"type": "OPENSEARCH", "host": "es.example.com", "port": 9200, "protocol": "http"})
        ));
    }

    #[test]
    fn test_force_port_forward_for_dynamodb_without_endpoint_url_false() {
        // DynamoDB with no endpointUrl (e.g. raw host:port not yet derived):
        // do not force — consistent with dynamo_client::dynamo_test_connection,
        // which also returns false when endpointUrl is absent.
        assert!(!force_port_forward_for(
            &json!({"type": "DYNAMODB", "host": "localhost", "port": 8000})
        ));
    }

    #[test]
    fn test_force_port_forward_for_missing_type_false() {
        assert!(!force_port_forward_for(&json!({"endpointUrl": "http://localhost:8000"})));
        assert!(!force_port_forward_for(&json!({})));
    }
}
