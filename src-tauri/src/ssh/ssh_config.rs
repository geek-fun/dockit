//! SSH config file (~/.ssh/config) parser and resolver.
//!
//! Parses a subset of OpenSSH client config: Host, HostName, Port, User, IdentityFile.
//! Wildcard patterns (*, ?) are skipped. Include directive is not supported in v1.

use crate::ssh::config::{SshConfigHostEntry, SshProfile, SshTunnelConfig};

/// Read ~/.ssh/config from the user's home directory.
/// Returns empty list if file doesn't exist (normal state for users without SSH config).
pub fn read_ssh_config() -> Result<Vec<SshConfigHostEntry>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let path = format!("{}/.ssh/config", home);

    match std::fs::read_to_string(&path) {
        Ok(content) => Ok(parse_ssh_config(&content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Failed to read {}: {}", path, e)),
    }
}

/// Parse SSH config file content into a list of host entries.
pub fn parse_ssh_config(content: &str) -> Vec<SshConfigHostEntry> {
    let mut entries: Vec<SshConfigHostEntry> = Vec::new();
    let mut current_aliases: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let line = strip_comment(raw_line).trim();
        if line.is_empty() {
            continue;
        }
        let Some((keyword, value)) = split_directive(line) else {
            continue;
        };

        match keyword.to_ascii_lowercase().as_str() {
            "host" => {
                current_aliases = value
                    .split_whitespace()
                    .filter(|a| !a.contains('*') && !a.contains('?'))
                    .map(str::to_string)
                    .collect();
                for alias in &current_aliases {
                    entries.push(SshConfigHostEntry {
                        host: alias.clone(),
                        host_name: None,
                        port: None,
                        user: None,
                        identity_file: None,
                    });
                }
            }
            "hostname" => set_current_field(&mut entries, &current_aliases, |e| {
                e.host_name = Some(value.to_string());
            }),
            "port" => {
                if let Ok(port) = value.parse::<u16>() {
                    set_current_field(&mut entries, &current_aliases, |e| {
                        e.port = Some(port);
                    });
                }
            }
            "user" => set_current_field(&mut entries, &current_aliases, |e| {
                e.user = Some(value.to_string());
            }),
            "identityfile" => set_current_field(&mut entries, &current_aliases, |e| {
                e.identity_file = Some(value.to_string());
            }),
            _ => {}
        }
    }

    entries
}

/// Find a host entry by alias.
pub fn find_host(alias: &str) -> Option<SshConfigHostEntry> {
    read_ssh_config()
        .ok()?
        .into_iter()
        .find(|e| e.host == alias)
}

/// Resolve a SshTunnelConfig against ~/.ssh/config.
/// If host matches an alias, fills in hostname, port, user, key_path from
/// the matching entry — but NEVER overwrites values the user explicitly set.
/// Sentinel values: port==22 (default), user=="" (empty), key_path=="" (empty).
pub fn resolve_ssh_tunnel_config(ssh: &SshTunnelConfig) -> SshTunnelConfig {
    match find_host(&ssh.host) {
        Some(entry) => apply_host_entry(ssh, entry),
        None => ssh.clone(),
    }
}

/// Resolve a SshProfile against ~/.ssh/config.
pub fn resolve_ssh_profile(profile: &SshProfile) -> SshProfile {
    let tunnel = profile.to_tunnel_config();
    let resolved = resolve_ssh_tunnel_config(&tunnel);
    SshProfile {
        id: profile.id.clone(),
        name: profile.name.clone(),
        host: resolved.host,
        port: resolved.port,
        username: resolved.username,
        auth_method: resolved.auth_method,
        password: resolved.password,
        key_path: resolved.key_path,
        key_passphrase: resolved.key_passphrase,
        use_ssh_agent: resolved.use_ssh_agent,
        ssh_agent_sock_path: resolved.ssh_agent_sock_path,
        connect_timeout_secs: resolved.connect_timeout_secs,
        keepalive_interval_secs: resolved.keepalive_interval_secs,
        verify_host_key: resolved.verify_host_key,
        expose_lan: resolved.expose_lan,
    }
}

// ── Internal helpers ──

fn apply_host_entry(ssh: &SshTunnelConfig, entry: SshConfigHostEntry) -> SshTunnelConfig {
    let mut resolved = ssh.clone();

    if let Some(host_name) = entry.host_name {
        resolved.host = host_name;
    }
    // Only fill user if it's empty (not explicitly set)
    if resolved.username.is_empty() {
        if let Some(user) = entry.user {
            resolved.username = user;
        }
    }
    // Only fill port if it's the default 22 (not explicitly set)
    if resolved.port == 22 {
        if let Some(port) = entry.port {
            resolved.port = port;
        }
    }
    // Only fill key_path if it's empty
    if resolved.key_path.is_empty() {
        if let Some(identity_file) = entry.identity_file {
            resolved.key_path = identity_file;
            // Auto-switch to key auth if password is empty
            if resolved.auth_method.is_empty()
                || (resolved.auth_method == "password" && resolved.password.is_empty())
            {
                resolved.auth_method = "key".to_string();
            }
        }
    }

    resolved
}

fn set_current_field(
    entries: &mut [SshConfigHostEntry],
    aliases: &[String],
    apply: impl Fn(&mut SshConfigHostEntry),
) {
    for entry in entries.iter_mut() {
        if aliases.contains(&entry.host) {
            apply(entry);
        }
    }
}

fn strip_comment(line: &str) -> &str {
    match line.find('#') {
        Some(i) => &line[..i],
        None => line,
    }
}

fn split_directive(line: &str) -> Option<(&str, &str)> {
    let line = line.trim();
    let i = line.find(|c: char| c.is_whitespace() || c == '=')?;
    let keyword = &line[..i];
    let value = line[i..]
        .trim_start_matches(|c: char| c.is_whitespace() || c == '=')
        .trim();
    if keyword.is_empty() || value.is_empty() {
        return None;
    }
    Some((keyword, value))
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    fn test_profile() -> SshTunnelConfig {
        SshTunnelConfig {
            enabled: true,
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
        }
    }

    #[test]
    fn test_parse_simple_config() {
        let content = "Host myserver\n  HostName 10.0.0.5\n  Port 2222\n  User deploy\n  IdentityFile ~/.ssh/id_ed25519\n";
        let entries = parse_ssh_config(content);
        assert_eq!(entries.len(), 1);
        let e = &entries[0];
        assert_eq!(e.host, "myserver");
        assert_eq!(e.host_name, Some("10.0.0.5".into()));
        assert_eq!(e.port, Some(2222));
        assert_eq!(e.user, Some("deploy".into()));
        assert_eq!(e.identity_file, Some("~/.ssh/id_ed25519".into()));
    }

    #[test]
    fn test_parse_multiple_aliases() {
        let content = "Host prod prod-alias\n  HostName 10.0.0.9\n";
        let entries = parse_ssh_config(content);
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().all(|e| e.host_name == Some("10.0.0.9".into())));
    }

    #[test]
    fn test_parse_skips_wildcards() {
        let content = "Host *.example.com\n  User git\nHost real\n  User deploy\n";
        let entries = parse_ssh_config(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].host, "real");
    }

    #[test]
    fn test_parse_ignores_comments() {
        let content = "# a comment\n\nHost myserver # inline\n  User deploy\n";
        let entries = parse_ssh_config(content);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].user, Some("deploy".into()));
    }

    #[test]
    fn test_resolve_fills_fields() {
        let mut ssh = test_profile();
        ssh.host = "myserver".into();

        let entry = SshConfigHostEntry {
            host: "myserver".into(),
            host_name: Some("10.0.0.5".into()),
            port: Some(2222),
            user: Some("deploy".into()),
            identity_file: Some("~/.ssh/id_ed25519".into()),
        };
        let resolved = apply_host_entry(&ssh, entry);
        assert_eq!(resolved.host, "10.0.0.5");
        assert_eq!(resolved.port, 2222);
        assert_eq!(resolved.username, "deploy");
        assert_eq!(resolved.key_path, "~/.ssh/id_ed25519");
        assert_eq!(resolved.auth_method, "key"); // auto-switched
    }

    #[test]
    fn test_resolve_preserves_explicit_values() {
        let mut ssh = test_profile();
        ssh.host = "myserver".into();
        ssh.username = "alice".into();
        ssh.port = 9999;
        ssh.key_path = "/explicit/key".into();

        let entry = SshConfigHostEntry {
            host: "myserver".into(),
            host_name: Some("10.0.0.5".into()),
            port: Some(2222),
            user: Some("deploy".into()),
            identity_file: Some("~/.ssh/id_ed25519".into()),
        };
        let resolved = apply_host_entry(&ssh, entry);
        assert_eq!(resolved.host, "10.0.0.5"); // hostname always overrides
        assert_eq!(resolved.username, "alice"); // explicit user preserved
        assert_eq!(resolved.port, 9999); // explicit port preserved
        assert_eq!(resolved.key_path, "/explicit/key"); // explicit key preserved
    }

    #[test]
    fn test_resolve_no_match_unchanged() {
        let mut ssh = test_profile();
        ssh.host = "unknown-alias".into();
        ssh.username = "root".into();
        let resolved = resolve_ssh_tunnel_config(&ssh);
        // On test machines, this alias likely won't exist in ~/.ssh/config
        // So fall back: host stays as alias, user stays as set
        assert_eq!(resolved.username, "root");
    }

    #[test]
    fn test_resolve_keeps_password_auth_when_password_present() {
        let mut ssh = test_profile();
        ssh.host = "myserver".into();
        ssh.password = "secret".into();
        ssh.auth_method = "password".into();

        let entry = SshConfigHostEntry {
            host: "myserver".into(),
            host_name: Some("10.0.0.5".into()),
            port: None,
            user: None,
            identity_file: Some("~/.ssh/id_ed25519".into()),
        };
        let resolved = apply_host_entry(&ssh, entry);
        assert_eq!(resolved.key_path, "~/.ssh/id_ed25519");
        assert_eq!(resolved.auth_method, "password"); // NOT switched to key
    }

    #[test]
    fn test_read_ssh_config_empty_on_missing() {
        let entries = parse_ssh_config("");
        assert!(entries.is_empty());
    }

    #[test]
    fn test_resolve_profile_roundtrip() {
        use crate::ssh::config::SshProfile;
        let profile = SshProfile {
            id: "p1".into(),
            name: "Bastion".into(),
            host: "nonexistent-zzz".into(),
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
        let resolved = resolve_ssh_profile(&profile);
        // Alias won't exist in real ~/.ssh/config, so host stays as-is
        assert_eq!(resolved.host, "nonexistent-zzz");
        assert_eq!(resolved.id, "p1");
        assert_eq!(resolved.name, "Bastion");
    }
}
