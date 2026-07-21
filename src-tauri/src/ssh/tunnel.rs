use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{Duration, MissedTickBehavior};

use russh::client::{self, Handle};
use russh::keys::agent::{client::AgentClient, AgentIdentity};
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::{ChannelMsg, Preferred};

use crate::ssh::config::{
    default_connect_timeout_secs, SshTunnelConfig, IDLE_PING_TIMEOUT_SECS,
    INITIAL_RECONNECT_DELAY_SECS, MAX_RECONNECT_ATTEMPTS, MAX_RECONNECT_DELAY_SECS,
};

const BUFFER_SIZE: usize = 65536;

// ── SshClient handler ──

struct SshClient {
    verify_host_key: bool,
}

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        if self.verify_host_key {
            log::warn!("Host key verification is not yet implemented; accepting key anyway");
        }
        Ok(true)
    }
}

// ── SSH client configuration ──

fn ssh_client_config() -> client::Config {
    let mut preferred = Preferred::default();
    let mut kex = preferred.kex.into_owned();
    for algorithm in [
        russh::kex::CURVE25519,
        russh::kex::ECDH_SHA2_NISTP256,
        russh::kex::ECDH_SHA2_NISTP384,
        russh::kex::ECDH_SHA2_NISTP521,
        russh::kex::DH_G14_SHA1,
    ] {
        if !kex.contains(&algorithm) {
            kex.push(algorithm);
        }
    }
    preferred.kex = std::borrow::Cow::Owned(kex);

    let mut macs = preferred.mac.into_owned();
    for algorithm in [
        russh::mac::HMAC_SHA1_ETM,
        russh::mac::HMAC_SHA1,
    ] {
        if !macs.contains(&algorithm) {
            macs.push(algorithm);
        }
    }
    preferred.mac = std::borrow::Cow::Owned(macs);

    client::Config {
        nodelay: true,
        keepalive_interval: Some(Duration::from_secs(30)),
        preferred,
        ..Default::default()
    }
}

// ── Session authentication ──

/// Authenticate the SSH session using the configured method.
///
/// Always probes with `none` first (some servers accept it). If the probe fails
/// and `auth_method` is explicitly `"none"`, returns an error. Otherwise falls
/// through to the configured credential method.
async fn authenticate_session(
    session: &mut Handle<SshClient>,
    config: &SshTunnelConfig,
    connect_timeout_secs: u64,
) -> Result<(), String> {
    let timeout = Duration::from_secs(connect_timeout_secs);

    // Probe with "none" first — some servers accept it.
    let none_result = tokio::time::timeout(
        timeout,
        session.authenticate_none(&config.username),
    )
    .await
    .map_err(|_| format!("SSH auth probe timed out ({}s)", connect_timeout_secs))?
    .map_err(|e| format!("SSH auth probe failed: {}", e))?;

    if none_result.success() {
        return Ok(());
    }

    // If auth_method is explicitly "none" and the probe was rejected, fail early.
    if config.auth_method == "none" {
        return Err(
            "SSH authentication failed: server rejected connection without credentials".to_string(),
        );
    }

    match config.auth_method.as_str() {
        "password" => {
            let auth_res = tokio::time::timeout(
                timeout,
                session.authenticate_password(&config.username, &config.password),
            )
            .await
            .map_err(|_| format!("Password auth timed out ({}s)", connect_timeout_secs))?
            .map_err(|e| format!("Password auth failed: {}", e))?;
            if !auth_res.success() {
                return Err("Password authentication failed".to_string());
            }
        }
        "key" => {
            let passphrase = if config.key_passphrase.is_empty() {
                None
            } else {
                Some(config.key_passphrase.as_str())
            };
            let key_pair =
                load_ssh_private_key(&config.key_path, passphrase)
                    .map_err(|e| format!("Failed to load SSH key: {}", e))?;
            let hash_alg = session
                .best_supported_rsa_hash()
                .await
                .ok()
                .flatten()
                .flatten();
            let auth_res = tokio::time::timeout(
                timeout,
                session.authenticate_publickey(
                    &config.username,
                    PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash_alg),
                ),
            )
            .await
            .map_err(|_| format!("Key auth timed out ({}s)", connect_timeout_secs))?
            .map_err(|e| format!("Key auth failed: {}", e))?;
            if !auth_res.success() {
                return Err("Public key authentication failed".to_string());
            }
        }
        "agent" => {
            authenticate_with_agent(
                session,
                &config.username,
                &config.ssh_agent_sock_path,
                &timeout,
            )
            .await?;
        }
        "" => {
            // "none" probe was attempted and rejected, and no method was configured.
            return Err(
                "SSH authentication failed: \"none\" was rejected and no password, \
                 key, or ssh-agent is configured"
                    .to_string(),
            );
        }
        other => {
            return Err(format!("Unknown SSH auth method: {}", other));
        }
    }

    Ok(())
}

// ── SSH agent authentication ──

async fn authenticate_with_agent_inner(
    mut agent: AgentClient<impl tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static>,
    session: &mut Handle<SshClient>,
    username: &str,
    timeout: &Duration,
) -> Result<(), String> {
    let identities = agent
        .request_identities()
        .await
        .map_err(|e| format!("SSH agent request failed: {}", e))?;

    if identities.is_empty() {
        return Err("SSH agent has no identities".to_string());
    }

    let hash_alg = session
        .best_supported_rsa_hash()
        .await
        .ok()
        .flatten()
        .flatten();

    let auth_result = tokio::time::timeout(*timeout, async {
        for identity in &identities {
            let result = match identity {
                AgentIdentity::PublicKey { key, .. } => {
                    session
                        .authenticate_publickey_with(username, key.clone(), hash_alg, &mut agent)
                        .await
                }
                AgentIdentity::Certificate { certificate, .. } => {
                    session
                        .authenticate_certificate_with(username, certificate.clone(), hash_alg, &mut agent)
                        .await
                }
            };

            match result {
                Ok(auth_res) if auth_res.success() => return Ok(()),
                Ok(_) => continue,
                Err(e) => {
                    log::debug!("SSH agent identity auth failed: {}", e);
                    continue;
                }
            }
        }
        Err("No SSH agent identity was accepted".to_string())
    })
    .await;

    match auth_result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("SSH agent auth timed out".to_string()),
    }
}

#[cfg(unix)]
async fn authenticate_with_agent(
    session: &mut Handle<SshClient>,
    username: &str,
    ssh_agent_sock_path: &str,
    timeout: &Duration,
) -> Result<(), String> {
    let agent = if ssh_agent_sock_path.is_empty() {
        AgentClient::connect_env()
            .await
            .map_err(|e| format!("SSH agent unavailable: {}", e))?
    } else {
        AgentClient::connect_uds(ssh_agent_sock_path)
            .await
            .map_err(|e| format!("SSH agent at '{}' unavailable: {}", ssh_agent_sock_path, e))?
    };

    authenticate_with_agent_inner(agent, session, username, timeout).await
}

#[cfg(windows)]
async fn authenticate_with_agent(
    session: &mut Handle<SshClient>,
    username: &str,
    _ssh_agent_sock_path: &str,
    timeout: &Duration,
) -> Result<(), String> {
    let stream = pageant::PageantStream::new()
        .await
        .map_err(|e| format!("SSH agent (Pageant) unavailable: {}", e))?;
    let agent = AgentClient::connect(stream);

    authenticate_with_agent_inner(agent, session, username, timeout).await
}

// ── Private key loading ──

fn load_ssh_private_key(
    path: &str,
    passphrase: Option<&str>,
) -> Result<russh::keys::PrivateKey, String> {
    let secret =
        std::fs::read_to_string(path).map_err(|e| format!("Cannot read SSH key file: {}", e))?;

    match russh::keys::decode_secret_key(&secret, passphrase) {
        Ok(key) => Ok(key),
        Err(err) if err.to_string().contains("character encoding invalid") => {
            let sanitized = sanitize_openssh_key_comment(&secret)?;
            russh::keys::decode_secret_key(&sanitized, passphrase)
                .map_err(|e| format!("SSH key decode failed (after comment sanitization): {}", e))
        }
        Err(err) => Err(format!("SSH key decode failed: {}", err)),
    }
}

// ── OpenSSH private key comment sanitization ──

fn sanitize_openssh_key_comment(secret: &str) -> Result<String, String> {
    const OPENSSH_BEGIN: &str = "-----BEGIN OPENSSH PRIVATE KEY-----";
    const OPENSSH_END: &str = "-----END OPENSSH PRIVATE KEY-----";

    if !secret.contains(OPENSSH_BEGIN) {
        return Err("Key is not an OpenSSH format private key".to_string());
    }

    let body: String = secret
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();

    let mut bytes = base64::engine::general_purpose::STANDARD
        .decode(body.as_bytes())
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    strip_openssh_comment(&mut bytes)?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("{}\n{}\n{}\n", OPENSSH_BEGIN, encoded, OPENSSH_END))
}

fn strip_openssh_comment(bytes: &mut Vec<u8>) -> Result<(), String> {
    const AUTH_MAGIC: &[u8] = b"openssh-key-v1\0";

    if !bytes.starts_with(AUTH_MAGIC) {
        return Err("Invalid OpenSSH key header".to_string());
    }

    let mut pos = AUTH_MAGIC.len();

    let cipher_name = read_ssh_string(bytes, &mut pos)?;
    if cipher_name != b"none" {
        return Err("Cannot sanitize encrypted OpenSSH keys".to_string());
    }

    let _kdf_name = read_ssh_string(bytes, &mut pos)?;
    let _kdf_options = read_ssh_string(bytes, &mut pos)?;
    let key_count = read_u32(bytes, &mut pos)?;

    if key_count == 0 {
        return Err("No private keys found in OpenSSH key file".to_string());
    }

    for _ in 0..key_count {
        let _public_key = read_ssh_string(bytes, &mut pos)?;
        let private_blob = read_ssh_string(bytes, &mut pos)?;
        let patched = zero_out_comment_in_blob(private_blob)?;

        let blob_start = pos - private_blob.len() - 4;
        let blob_len_pos = blob_start;
        let patched_len = patched.len();
        bytes.splice(
            blob_len_pos..pos,
            (patched_len as u32)
                .to_be_bytes()
                .into_iter()
                .chain(patched),
        );
        pos = blob_len_pos + 4 + patched_len;
    }

    Ok(())
}

fn zero_out_comment_in_blob(blob: &[u8]) -> Result<Vec<u8>, String> {
    let unpadded_end = blob
        .len()
        .checked_sub(find_padding_len(blob)?)
        .ok_or_else(|| "Invalid padding in private key blob".to_string())?;

    let comment_pos = find_comment_position(&blob[..unpadded_end])
        .ok_or_else(|| "Could not locate comment field in private key".to_string())?;

    let mut patched = blob.to_vec();
    patched[comment_pos..comment_pos + 4].copy_from_slice(&0u32.to_be_bytes());
    Ok(patched)
}

fn find_comment_position(bytes: &[u8]) -> Option<usize> {
    for pos in (8..bytes.len().saturating_sub(3)).rev() {
        let len_bytes = bytes.get(pos..pos + 4)?;
        let len = u32::from_be_bytes(len_bytes.try_into().ok()?) as usize;
        if pos.checked_add(4)?.checked_add(len)? == bytes.len() {
            return Some(pos);
        }
    }
    None
}

fn find_padding_len(bytes: &[u8]) -> Result<usize, String> {
    for len in (1..=16).rev() {
        if bytes.len() >= len
            && bytes[bytes.len() - len..]
                .iter()
                .enumerate()
                .all(|(i, &b)| b == (i + 1) as u8)
        {
            return Ok(len);
        }
    }
    Err("Invalid private key padding".to_string())
}

fn read_ssh_string<'a>(bytes: &'a [u8], pos: &mut usize) -> Result<&'a [u8], String> {
    let len = read_u32(bytes, pos)? as usize;
    let end = pos
        .checked_add(len)
        .ok_or_else(|| "Invalid SSH string length".to_string())?;
    if end > bytes.len() {
        return Err("SSH string exceeds buffer".to_string());
    }
    let value = &bytes[*pos..end];
    *pos = end;
    Ok(value)
}

fn read_u32(bytes: &[u8], pos: &mut usize) -> Result<u32, String> {
    let end = pos
        .checked_add(4)
        .ok_or_else(|| "Unexpected end of SSH key data".to_string())?;
    if end > bytes.len() {
        return Err("Key data truncated".to_string());
    }
    let value = u32::from_be_bytes(bytes[*pos..end].try_into().unwrap());
    *pos = end;
    Ok(value)
}

// ── Forward loop ──

/// Accept connections on the local listener and forward them through the SSH session.
/// Returns when the SSH session dies (listener error or `session.is_closed()`).
/// Periodically pings the session to detect stale connections.
async fn forward_loop(
    session: &Handle<SshClient>,
    listener: &TcpListener,
    remote_host: &str,
    remote_port: u16,
    keepalive_interval: Duration,
) {
    let interval_secs = std::cmp::max(keepalive_interval.as_secs(), 5);
    let mut idle_check = tokio::time::interval(Duration::from_secs(interval_secs));
    idle_check.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        let accepted = tokio::select! {
            result = listener.accept() => result,
            _ = idle_check.tick() => {
                if session.is_closed() {
                    log::warn!("SSH tunnel session closed while idle");
                    break;
                }
                match tokio::time::timeout(
                    Duration::from_secs(IDLE_PING_TIMEOUT_SECS),
                    session.send_ping(),
                ).await {
                    Ok(Ok(())) => continue,
                    Ok(Err(e)) => {
                        log::warn!("SSH tunnel health ping failed: {}", e);
                        break;
                    }
                    Err(_) => {
                        log::warn!("SSH tunnel health ping timed out");
                        break;
                    }
                }
            }
        };

        let (mut stream, peer_addr) = match accepted {
            Ok(v) => v,
            Err(e) => {
                log::error!("SSH tunnel listener error: {}", e);
                break;
            }
        };

        if session.is_closed() {
            log::warn!("SSH tunnel session closed, exiting forward loop");
            break;
        }

        let mut channel = match session
            .channel_open_direct_tcpip(
                remote_host,
                remote_port.into(),
                peer_addr.ip().to_string(),
                peer_addr.port().into(),
            )
            .await
        {
            Ok(c) => c,
            Err(e) => {
                log::error!("SSH direct-tcpip channel open failed: {}", e);
                break;
            }
        };

        tokio::spawn(async move {
            let mut buf = vec![0u8; BUFFER_SIZE];
            let mut stream_closed = false;

            loop {
                tokio::select! {
                    r = stream.read(&mut buf), if !stream_closed => {
                        match r {
                            Ok(0) => {
                                stream_closed = true;
                                let _ = channel.eof().await;
                            }
                            Ok(n) => {
                                if channel.data(&buf[..n]).await.is_err() {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    msg = channel.wait() => {
                        match msg {
                            Some(ChannelMsg::Data { ref data }) => {
                                if stream.write_all(data).await.is_err() {
                                    break;
                                }
                            }
                            Some(ChannelMsg::Eof) | None => break,
                            _ => {}
                        }
                    }
                }
            }
        });
    }
}

// ── Reconnect loop ──

/// Background tunnel task: runs `forward_loop` and reconnects with exponential backoff
/// when the SSH session drops. The local `TcpListener` survives across reconnections
/// so the tunnel appears continuously available to clients.
async fn tunnel_reconnect_loop(
    config: SshTunnelConfig,
    connect_timeout_secs: u64,
    listener: TcpListener,
    remote_host: String,
    remote_port: u16,
) {
    let initial_config = config;
    let mut current_config = initial_config.clone();

    loop {
        let connect_host = current_config.host.clone();
        let connect_port = current_config.port;

        log::info!(
            "SSH tunnel active: {}:{} -> {}:{}",
            connect_host,
            connect_port,
            remote_host,
            remote_port
        );

        match client::connect(
            Arc::new(ssh_client_config()),
            (&*connect_host, connect_port),
            SshClient {
                verify_host_key: current_config.verify_host_key,
            },
        )
        .await
        {
            Ok(mut raw_session) => {
                match authenticate_session(&mut raw_session, &current_config, connect_timeout_secs)
                    .await
                {
                    Ok(()) => {
                        let ka = Duration::from_secs(current_config.keepalive_interval_secs);
                        forward_loop(&raw_session, &listener, &remote_host, remote_port, ka).await;
                        log::warn!(
                            "SSH tunnel lost ({}:{}), reconnecting...",
                            connect_host,
                            connect_port
                        );
                    }
                    Err(e) => {
                        log::error!(
                            "SSH tunnel auth failed ({}:{}): {}",
                            connect_host,
                            connect_port,
                            e
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "SSH tunnel connect failed ({}:{}): {}",
                    connect_host,
                    connect_port,
                    e
                );
            }
        }

        let mut delay = Duration::from_secs(INITIAL_RECONNECT_DELAY_SECS);
        let mut attempts: u32 = 0;

        loop {
            if attempts >= MAX_RECONNECT_ATTEMPTS {
                log::error!(
                    "SSH tunnel max reconnect attempts ({}) exhausted for {}:{}",
                    MAX_RECONNECT_ATTEMPTS,
                    connect_host,
                    connect_port
                );
                return;
            }

            tokio::time::sleep(delay).await;

            match client::connect(
                Arc::new(ssh_client_config()),
                (&*connect_host, connect_port),
                SshClient {
                    verify_host_key: current_config.verify_host_key,
                },
            )
            .await
            {
                Ok(mut raw_session) => {
                    match authenticate_session(
                        &mut raw_session,
                        &current_config,
                        connect_timeout_secs,
                    )
                    .await
                    {
                        Ok(()) => {
                            current_config = initial_config.clone();
                            log::info!(
                                "SSH tunnel reconnected to {}:{} (attempt {})",
                                connect_host,
                                connect_port,
                                attempts + 1
                            );
                            let ka =
                                Duration::from_secs(current_config.keepalive_interval_secs);
                            forward_loop(
                                &raw_session,
                                &listener,
                                &remote_host,
                                remote_port,
                                ka,
                            )
                            .await;
                            break;
                        }
                        Err(e) => {
                            attempts += 1;
                            log::error!(
                                "SSH reconnect auth failed (attempt {}/{}): {}",
                                attempts,
                                MAX_RECONNECT_ATTEMPTS,
                                e
                            );
                        }
                    }
                }
                Err(e) => {
                    attempts += 1;
                    log::error!(
                        "SSH reconnect failed ({}:{}, attempt {}/{}): {}",
                        connect_host,
                        connect_port,
                        attempts,
                        MAX_RECONNECT_ATTEMPTS,
                        e
                    );
                }
            }

            delay = std::cmp::min(delay * 2, Duration::from_secs(MAX_RECONNECT_DELAY_SECS));
        }
    }
}

// ── Tunnel entry and manager ──

struct TunnelEntry {
    handles: Vec<JoinHandle<()>>,
    local_port: u16,
}

pub struct TunnelManager {
    tunnels: Mutex<HashMap<String, TunnelEntry>>,
}

impl Default for TunnelManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            tunnels: Mutex::new(HashMap::new()),
        }
    }

    /// Start a single-hop SSH tunnel. Returns the local port once connectivity is verified.
    /// Employs double-checked locking: checks the cache under the lock, connects outside
    /// the lock, then re-checks under the lock before inserting.
    pub async fn start_tunnel(
        &self,
        connection_key: &str,
        config: &SshTunnelConfig,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<u16, String> {
        // Fast check under lock — avoid duplicate tunnels.
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(port) = get_active_port(&mut tunnels, connection_key) {
                return Ok(port);
            }
        }

        // Slow path: connect and verify.
        let (handle, local_port) = spawn_tunnel(config, remote_host, remote_port).await?;

        // Re-check under lock — another caller may have raced ahead.
        let mut tunnels = self.tunnels.lock().await;
        if let Some(port) = get_active_port(&mut tunnels, connection_key) {
            handle.abort();
            return Ok(port);
        }

        tunnels.insert(
            connection_key.to_string(),
            TunnelEntry {
                handles: vec![handle],
                local_port,
            },
        );
        Ok(local_port)
    }

    /// Start a multi-hop SSH tunnel chain. Each hop connects to the next, and the
    /// last hop forwards to `remote_host:remote_port`. Returns the final local port.
    pub async fn start_chain(
        &self,
        connection_key: &str,
        hops: &[SshTunnelConfig],
        remote_host: &str,
        remote_port: u16,
    ) -> Result<u16, String> {
        if hops.is_empty() {
            return Err("No SSH tunnel hops configured".to_string());
        }

        // Fast check under lock.
        {
            let mut tunnels = self.tunnels.lock().await;
            if let Some(port) = get_active_port(&mut tunnels, connection_key) {
                return Ok(port);
            }
        }

        let mut handles: Vec<JoinHandle<()>> = Vec::new();
        let mut next_connect_endpoint: Option<(String, u16)> = None;
        let mut final_local_port = 0;

        for (index, hop) in hops.iter().enumerate() {
            let is_last = index + 1 == hops.len();
            let (connect_host, connect_port) =
                next_connect_endpoint.clone().unwrap_or_else(|| (hop.host.clone(), hop.port));
            let (target_host, target_port) = if is_last {
                (remote_host.to_string(), remote_port)
            } else {
                (hops[index + 1].host.clone(), hops[index + 1].port)
            };

            let hop_timeout = if hop.connect_timeout_secs > 0 {
                hop.connect_timeout_secs
            } else {
                default_connect_timeout_secs()
            };

            let mut hop_config = hop.clone();
            hop_config.host = connect_host;
            hop_config.port = connect_port;
            hop_config.connect_timeout_secs = hop_timeout;

            let expose = is_last && hop.expose_lan;
            let (handle, local_port) = match spawn_tunnel_config(
                &hop_config,
                &target_host,
                target_port,
                expose,
            )
            .await
            {
                Ok(v) => v,
                Err(err) => {
                    // Abort all previously-spawned hops before propagating,
                    // otherwise their tokio tasks and listeners leak.
                    for h in &handles {
                        h.abort();
                    }
                    return Err(format!("SSH hop {} failed: {}", index + 1, err));
                }
            };

            handles.push(handle);
            final_local_port = local_port;
            next_connect_endpoint = Some(("127.0.0.1".to_string(), local_port));
        }

        // Re-check under lock.
        let mut tunnels = self.tunnels.lock().await;
        if let Some(port) = get_active_port(&mut tunnels, connection_key) {
            for handle in handles {
                handle.abort();
            }
            return Ok(port);
        }

        tunnels.insert(
            connection_key.to_string(),
            TunnelEntry {
                handles,
                local_port: final_local_port,
            },
        );
        Ok(final_local_port)
    }

    /// Read-only query for an existing tunnel's local port.
    pub async fn local_port(&self, connection_key: &str) -> Option<u16> {
        let tunnels = self.tunnels.lock().await;
        tunnels.get(connection_key).map(|entry| entry.local_port)
    }

    /// Stop and abort a specific tunnel by key.
    pub async fn stop_tunnel(&self, connection_key: &str) {
        let mut tunnels = self.tunnels.lock().await;
        if let Some(entry) = tunnels.remove(connection_key) {
            for handle in entry.handles {
                handle.abort();
            }
        }
    }

    /// Stop and abort all active tunnels.
    pub async fn stop_all(&self) {
        let mut tunnels = self.tunnels.lock().await;
        for (_id, entry) in tunnels.drain() {
            for handle in entry.handles {
                handle.abort();
            }
        }
    }
}

// ── Internal helpers ──

/// Check if a tunnel entry is still alive. Evicts stale entries whose background
/// handles have all exited. Returns the local port if the tunnel is active.
fn get_active_port(
    tunnels: &mut HashMap<String, TunnelEntry>,
    connection_key: &str,
) -> Option<u16> {
    let entry = tunnels.get(connection_key)?;
    if entry.handles.iter().all(|h| h.is_finished()) {
        tunnels.remove(connection_key);
        return None;
    }
    Some(entry.local_port)
}

/// Spawn a tunnel task with synchronous SSH verification.
/// Binds to 127.0.0.1 by default, 0.0.0.0 when `config.expose_lan` is true.
async fn spawn_tunnel(
    config: &SshTunnelConfig,
    remote_host: &str,
    remote_port: u16,
) -> Result<(JoinHandle<()>, u16), String> {
    spawn_tunnel_config(config, remote_host, remote_port, config.expose_lan).await
}

async fn spawn_tunnel_config(
    config: &SshTunnelConfig,
    remote_host: &str,
    remote_port: u16,
    expose_lan: bool,
) -> Result<(JoinHandle<()>, u16), String> {
    let local_port = portpicker::pick_unused_port().ok_or("No available local port")?;

    let bind_addr = if expose_lan { "0.0.0.0" } else { "127.0.0.1" };
    let listener = TcpListener::bind((bind_addr, local_port))
        .await
        .map_err(|e| format!("Failed to bind local tunnel port: {}", e))?;

    let timeout = if config.connect_timeout_secs > 0 {
        config.connect_timeout_secs
    } else {
        default_connect_timeout_secs()
    };

    // Synchronously verify SSH connectivity before returning.
    // This ensures the tunnel is ready before any client connects.
    let ssh_config_init = Arc::new(ssh_client_config());
    let timeout_dur = Duration::from_secs(timeout);
    let mut init_session = tokio::time::timeout(
        timeout_dur,
        client::connect(
            ssh_config_init,
            (&*config.host, config.port),
            SshClient {
                verify_host_key: config.verify_host_key,
            },
        ),
    )
    .await
    .map_err(|_| format!("SSH connection timed out ({}s)", timeout))?
    .map_err(|e| format!("SSH connection failed: {}", e))?;

    authenticate_session(&mut init_session, config, timeout).await?;

    let task_config = config.clone();
    let task_remote_host = remote_host.to_string();
    let handle = tokio::spawn(async move {
        tunnel_reconnect_loop(
            task_config,
            timeout,
            listener,
            task_remote_host,
            remote_port,
        )
        .await;
    });

    Ok((handle, local_port))
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose;

    fn push_string(bytes: &mut Vec<u8>, value: &[u8]) {
        bytes.extend_from_slice(&(value.len() as u32).to_be_bytes());
        bytes.extend_from_slice(value);
    }

    fn pad_to_block(bytes: &mut Vec<u8>, block_size: usize) {
        let pad_len = block_size - (bytes.len() % block_size);
        for i in 1..=pad_len {
            bytes.push(i as u8);
        }
    }

    // ── OpenSSH key sanitization tests ──

    #[test]
    fn test_sanitize_openssh_key_strips_trailing_content() {
        let mut container = b"openssh-key-v1\0".to_vec();
        push_string(&mut container, b"none");
        push_string(&mut container, b"none");
        push_string(&mut container, b"");
        container.extend_from_slice(&[0, 0, 0, 1]);
        push_string(&mut container, b"public-key-data");

        let mut private_blob = vec![0u8; 16];
        push_string(&mut private_blob, b"hello");
        pad_to_block(&mut private_blob, 8);

        push_string(&mut container, &private_blob);
        pad_to_block(&mut container, 8);

        let b64 = general_purpose::STANDARD.encode(&container);
        let pem = format!(
            "-----BEGIN OPENSSH PRIVATE KEY-----\n{}\n-----END OPENSSH PRIVATE KEY-----",
            b64
        );

        let result = sanitize_openssh_key_comment(&pem);
        assert!(
            result.is_ok(),
            "sanitize should succeed: {:?}",
            result.err()
        );
        let sanitized = result.unwrap();
        assert!(sanitized.starts_with("-----BEGIN OPENSSH PRIVATE KEY-----"));
        assert!(sanitized.ends_with("-----\n"));
    }

    #[test]
    fn test_sanitize_rejects_non_openssh() {
        let pkcs1 =
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
        let result = sanitize_openssh_key_comment(pkcs1);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not an OpenSSH format"));
    }

    #[test]
    fn test_find_padding_len() {
        let data = vec![1, 2, 3, 4, 5, 6, 7, 8];
        assert_eq!(find_padding_len(&data), Ok(8));

        let data2 = vec![1, 2, 4, 8];
        assert_eq!(
            find_padding_len(&data2),
            Err("Invalid private key padding".to_string())
        );
    }

    #[test]
    fn test_read_u32_normal() {
        let data = [0x00, 0x00, 0x00, 0x05, 0x01, 0x02];
        let mut pos = 0;
        assert_eq!(read_u32(&data, &mut pos).unwrap(), 5);
        assert_eq!(pos, 4);
    }

    #[test]
    fn test_read_u32_truncated() {
        let data = [0x00, 0x01];
        let mut pos = 0;
        assert!(read_u32(&data, &mut pos).is_err());
    }

    #[test]
    fn test_read_ssh_string() {
        let data = [0x00, 0x00, 0x00, 0x03, 0x41, 0x42, 0x43];
        let mut pos = 0;
        let s = read_ssh_string(&data, &mut pos).unwrap();
        assert_eq!(s, b"ABC");
        assert_eq!(pos, 7);
    }

    #[test]
    fn test_read_ssh_string_truncated() {
        let data = [0x00, 0x00, 0x00, 0x10, 0x41];
        let mut pos = 0;
        assert!(read_ssh_string(&data, &mut pos).is_err());
    }

    // ── TunnelManager tests ──

    #[test]
    fn test_tunnel_manager_new_and_default() {
        let mgr = TunnelManager::new();
        let mgr2 = TunnelManager::default();
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            assert_eq!(mgr.local_port("any").await, None);
            assert_eq!(mgr2.local_port("any").await, None);
        });
    }

    #[test]
    fn test_tunnel_manager_local_port_missing() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mgr = TunnelManager::new();
            assert_eq!(mgr.local_port("nonexistent").await, None);
        });
    }

    #[test]
    fn test_tunnel_manager_stop_missing() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mgr = TunnelManager::new();
            mgr.stop_tunnel("nonexistent").await;
        });
    }

    #[test]
    fn test_tunnel_manager_stop_all_empty() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let mgr = TunnelManager::new();
            mgr.stop_all().await;
        });
    }

    // ── Comment position tests ──

    #[test]
    fn test_find_comment_position_typical() {
        let mut blob = vec![0u8; 32];
        blob[28] = 0;
        blob[29] = 0;
        blob[30] = 0;
        blob[31] = 4;
        blob.extend_from_slice(b"test");
        let pos = find_comment_position(&blob);
        assert_eq!(pos, Some(28));
    }

    #[test]
    fn test_find_comment_position_too_short() {
        let blob = vec![0u8; 4];
        assert_eq!(find_comment_position(&blob), None);
    }

    #[test]
    fn test_zero_out_comment_in_blob() {
        let mut blob = Vec::new();
        blob.extend_from_slice(b"fake-key-bytes");
        let comment_len_pos = blob.len();
        push_string(&mut blob, b"hello");
        pad_to_block(&mut blob, 8);

        let result = zero_out_comment_in_blob(&blob);
        assert!(result.is_ok(), "should succeed: {:?}", result.err());
        let patched = result.unwrap();
        assert_eq!(
            &patched[comment_len_pos..comment_len_pos + 4],
            &[0u8, 0u8, 0u8, 0u8],
            "comment length field should be zeroed"
        );
    }

    // ── Config tests ──

    #[test]
    fn test_ssh_client_config_kex_order() {
        let config = ssh_client_config();
        let kex = config.preferred.kex;
        let curve25519_index = kex
            .iter()
            .position(|a| *a == russh::kex::CURVE25519)
            .unwrap();
        let ecdh_index = kex
            .iter()
            .position(|a| *a == russh::kex::ECDH_SHA2_NISTP256)
            .unwrap();
        let group14_sha1_index = kex
            .iter()
            .position(|a| *a == russh::kex::DH_G14_SHA1)
            .unwrap();

        assert!(curve25519_index < ecdh_index);
        assert!(ecdh_index < group14_sha1_index);
    }

    #[test]
    fn test_ssh_client_config_mac_order() {
        let config = ssh_client_config();
        let macs = config.preferred.mac;
        let sha256_etm_index = macs
            .iter()
            .position(|a| *a == russh::mac::HMAC_SHA256_ETM)
            .unwrap();
        let sha1_etm_index = macs
            .iter()
            .position(|a| *a == russh::mac::HMAC_SHA1_ETM)
            .unwrap();
        let sha1_index = macs
            .iter()
            .position(|a| *a == russh::mac::HMAC_SHA1)
            .unwrap();

        assert!(sha256_etm_index < sha1_etm_index);
        assert!(sha1_etm_index < sha1_index);
    }
}
