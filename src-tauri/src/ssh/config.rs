use serde::{Deserialize, Serialize};

/// First-class SSH tunnel profile stored in .store.dat under "sshProfiles".
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshProfile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    /// "password" | "key" | "agent" | "none" | "" (auto-probe)
    #[serde(default)]
    pub auth_method: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub key_path: String,
    #[serde(default)]
    pub key_passphrase: String,
    #[serde(default)]
    pub use_ssh_agent: bool,
    #[serde(default)]
    pub ssh_agent_sock_path: String,
    #[serde(default = "default_connect_timeout_secs")]
    pub connect_timeout_secs: u64,
    #[serde(default = "default_keepalive_interval_secs")]
    pub keepalive_interval_secs: u64,
    #[serde(default)]
    pub verify_host_key: bool,
    #[serde(default)]
    pub expose_lan: bool,
}

/// SSH tunnel configuration derived from SshProfile at tunnel start time.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub auth_method: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub key_path: String,
    #[serde(default)]
    pub key_passphrase: String,
    #[serde(default)]
    pub use_ssh_agent: bool,
    #[serde(default)]
    pub ssh_agent_sock_path: String,
    #[serde(default = "default_connect_timeout_secs")]
    pub connect_timeout_secs: u64,
    #[serde(default = "default_keepalive_interval_secs")]
    pub keepalive_interval_secs: u64,
    #[serde(default)]
    pub verify_host_key: bool,
    #[serde(default)]
    pub expose_lan: bool,
}

/// SSH connection configuration stored on each database connection.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectionConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub profile_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inline: Option<SshTunnelConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_proxy: Option<String>,
}

/// Transport layer configuration — tagged enum for serde.
/// Only SSH in v1; extensible for SOCKS/HTTP tunnel in v2.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum TransportLayerConfig {
    Ssh(SshTunnelConfig),
}

impl TransportLayerConfig {
    pub fn enabled(&self) -> bool {
        match self {
            TransportLayerConfig::Ssh(l) => l.enabled,
        }
    }

    pub fn endpoint(&self) -> (&str, u16) {
        match self {
            TransportLayerConfig::Ssh(l) => (&l.host, l.port),
        }
    }
}

/// SSH config host entry from ~/.ssh/config parsing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshConfigHostEntry {
    pub host: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity_file: Option<String>,
}

// ── Defaults & constants ──

fn default_true() -> bool {
    true
}
fn default_ssh_port() -> u16 {
    22
}
pub const fn default_connect_timeout_secs() -> u64 {
    10
}
pub const fn default_keepalive_interval_secs() -> u64 {
    30
}
pub const INITIAL_RECONNECT_DELAY_SECS: u64 = 5;
pub const MAX_RECONNECT_DELAY_SECS: u64 = 60;
pub const MAX_RECONNECT_ATTEMPTS: u32 = 10;
pub const IDLE_PING_TIMEOUT_SECS: u64 = 10;

// ── Conversions ──

impl SshProfile {
    pub fn to_tunnel_config(&self) -> SshTunnelConfig {
        SshTunnelConfig {
            enabled: true,
            host: self.host.clone(),
            port: self.port,
            username: self.username.clone(),
            auth_method: self.auth_method.clone(),
            password: self.password.clone(),
            key_path: self.key_path.clone(),
            key_passphrase: self.key_passphrase.clone(),
            use_ssh_agent: self.use_ssh_agent,
            ssh_agent_sock_path: self.ssh_agent_sock_path.clone(),
            connect_timeout_secs: self.connect_timeout_secs,
            keepalive_interval_secs: self.keepalive_interval_secs,
            verify_host_key: self.verify_host_key,
            expose_lan: self.expose_lan,
        }
    }
}

impl SshTunnelConfig {
    pub fn from_profile(profile: &SshProfile) -> Self {
        profile.to_tunnel_config()
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ssh_profile_serde_roundtrip() {
        let profile = SshProfile {
            id: "p1".into(),
            name: "Bastion".into(),
            host: "bastion.corp.com".into(),
            port: 2222,
            username: "ec2-user".into(),
            auth_method: "key".into(),
            password: String::new(),
            key_path: "~/.ssh/corp.pem".into(),
            key_passphrase: "secret".into(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 15,
            keepalive_interval_secs: 60,
            verify_host_key: true,
            expose_lan: false,
        };
        let json = serde_json::to_string(&profile).unwrap();
        let parsed: SshProfile = serde_json::from_str(&json).unwrap();
        assert_eq!(profile, parsed);
    }

    #[test]
    fn test_ssh_tunnel_config_serde_roundtrip() {
        let config = SshTunnelConfig {
            enabled: true,
            host: "host".into(),
            port: 22,
            username: "user".into(),
            auth_method: "password".into(),
            password: "pass".into(),
            key_path: String::new(),
            key_passphrase: String::new(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 10,
            keepalive_interval_secs: 30,
            verify_host_key: false,
            expose_lan: false,
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: SshTunnelConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, parsed);
    }

    #[test]
    fn test_transport_layer_config_ssh_tag() {
        let config = SshTunnelConfig {
            enabled: true,
            host: "h".into(),
            port: 22,
            username: "u".into(),
            auth_method: String::new(),
            password: String::new(),
            key_path: String::new(),
            key_passphrase: String::new(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 10,
            keepalive_interval_secs: 30,
            verify_host_key: false,
            expose_lan: false,
        };
        let layer = TransportLayerConfig::Ssh(config);
        let json = serde_json::to_string(&layer).unwrap();
        assert!(json.contains("\"type\":\"ssh\""));
        let parsed: TransportLayerConfig = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, TransportLayerConfig::Ssh(_)));
    }

    #[test]
    fn test_ssh_profile_to_tunnel_config() {
        let profile = SshProfile {
            id: "p1".into(),
            name: "B".into(),
            host: "h".into(),
            port: 2222,
            username: "u".into(),
            auth_method: "key".into(),
            password: String::new(),
            key_path: "k".into(),
            key_passphrase: "pp".into(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 15,
            keepalive_interval_secs: 60,
            verify_host_key: true,
            expose_lan: true,
        };
        let config = profile.to_tunnel_config();
        assert_eq!(config.host, "h");
        assert_eq!(config.port, 2222);
        assert_eq!(config.auth_method, "key");
        assert_eq!(config.key_path, "k");
        assert_eq!(config.expose_lan, true);
    }

    #[test]
    fn test_default_values() {
        let profile = SshProfile {
            id: String::new(),
            name: String::new(),
            host: String::new(),
            port: 22,
            username: String::new(),
            auth_method: String::new(),
            password: String::new(),
            key_path: String::new(),
            key_passphrase: String::new(),
            use_ssh_agent: false,
            ssh_agent_sock_path: String::new(),
            connect_timeout_secs: 10,
            keepalive_interval_secs: 30,
            verify_host_key: false,
            expose_lan: false,
        };
        // Verify these match our constants
        assert_eq!(
            profile.connect_timeout_secs,
            default_connect_timeout_secs()
        );
        assert_eq!(
            profile.keepalive_interval_secs,
            default_keepalive_interval_secs()
        );
    }

    #[test]
    fn test_ssh_connection_config_disabled_default() {
        let json = r#"{}"#;
        let config: SshConnectionConfig = serde_json::from_str(json).unwrap();
        assert!(!config.enabled);
        assert!(config.profile_ids.is_empty());
        assert!(config.inline.is_none());
    }
}
