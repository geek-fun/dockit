//! Transport layer orchestration — starts/stops SSH tunnels for connections.
//! Resolves ~/.ssh/config aliases on SSH layers before starting tunnels.

use crate::ssh::config::TransportLayerConfig;
use crate::ssh::ssh_config::resolve_ssh_tunnel_config;
use crate::ssh::TunnelManager;

/// Start transport layers for a connection.
/// Returns `Ok(Some(local_port))` if tunnel was started, `Ok(None)` if no layers.
pub async fn start_transport_layers(
    connection_key: &str,
    layers: &[TransportLayerConfig],
    remote_host: &str,
    remote_port: u16,
    tunnels: &TunnelManager,
) -> Result<Option<u16>, String> {
    let enabled: Vec<&TransportLayerConfig> = layers.iter().filter(|l| l.enabled()).collect();

    if enabled.is_empty() {
        return Ok(None);
    }

    // Resolve ~/.ssh/config aliases on each SSH layer
    let resolved: Vec<TransportLayerConfig> = enabled
        .iter()
        .map(|layer| match layer {
            TransportLayerConfig::Ssh(config) => {
                TransportLayerConfig::Ssh(resolve_ssh_tunnel_config(config))
            }
        })
        .collect();

    // Build the chain of hops: each hop connects to (next_hop_host, next_hop_port)
    // or (remote_host, remote_port) for the last hop.
    match resolved.len() {
        1 => {
            let TransportLayerConfig::Ssh(config) = &resolved[0];
            let local_port = tunnels
                .start_tunnel(connection_key, config, remote_host, remote_port)
                .await?;
            Ok(Some(local_port))
        }
        _n => {
            // Multi-hop: build Vec of SshTunnelConfigs for start_chain
            let hops: Vec<_> = resolved
                .iter()
                .map(|layer| match layer {
                    TransportLayerConfig::Ssh(c) => c.clone(),
                })
                .collect();
            let local_port = tunnels
                .start_chain(connection_key, &hops, remote_host, remote_port)
                .await?;
            Ok(Some(local_port))
        }
    }
}

/// Stop transport layers for a connection.
pub async fn stop_transport_layers(
    connection_key: &str,
    tunnels: &TunnelManager,
) {
    tunnels.stop_tunnel(connection_key).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssh::config::SshTunnelConfig;

    fn test_config() -> SshTunnelConfig {
        SshTunnelConfig {
            enabled: true,
            host: "test.example.com".into(),
            port: 22,
            username: "testuser".into(),
            auth_method: "agent".into(),
            password: String::new(),
            key_path: String::new(),
            key_passphrase: String::new(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 5,
            keepalive_interval_secs: 30,
            verify_host_key: false,
            expose_lan: false,
        }
    }

    #[tokio::test]
    async fn test_empty_layers_returns_none() {
        let tunnels = TunnelManager::new();
        let result = start_transport_layers("test", &[], "db.example.com", 5432, &tunnels).await;
        assert_eq!(result.unwrap(), None);
    }

    #[tokio::test]
    async fn test_disabled_layers_return_none() {
        let mut config = test_config();
        config.enabled = false;
        let layers = vec![TransportLayerConfig::Ssh(config)];
        let tunnels = TunnelManager::new();
        let result = start_transport_layers("test", &layers, "db.example.com", 5432, &tunnels).await;
        assert_eq!(result.unwrap(), None);
    }

    #[tokio::test]
    async fn test_stop_empty_does_nothing() {
        let tunnels = TunnelManager::new();
        stop_transport_layers("nonexistent", &tunnels).await;
    }
}
