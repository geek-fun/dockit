use std::env;
use std::time::Duration;

fn get_proxy(http_proxy: Option<String>) -> Option<String> {
    let sys_proxy = env::var("HTTPS_PROXY")
        .ok()
        .or(env::var("https_proxy").ok());
    match http_proxy {
        Some(proxy) if !proxy.is_empty() => Some(proxy),
        _ => sys_proxy,
    }
}

const CONNECT_TIMEOUT_SECS: u64 = 15;

/// Build an HTTP client with a configurable request-level timeout.
///
/// All clients get a 15s connect timeout (TCP/TLS handshake — never breaks
/// streaming). Pass `Some(Duration)` for a per-request timeout on short
/// operations like validation; pass `None` for streaming or long-running
/// requests (LLM chat, ES queries, file downloads).
pub fn create_http_client(
    proxy: Option<String>,
    ssl: Option<bool>,
    request_timeout: Option<Duration>,
) -> reqwest::Client {
    let mut builder = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(!ssl.unwrap_or(true))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS));

    if let Some(duration) = request_timeout {
        builder = builder.timeout(duration);
    }

    if let Some(proxy_url) = get_proxy(proxy) {
        match reqwest::Proxy::all(&proxy_url) {
            Ok(proxy) => {
                builder = builder.proxy(proxy);
            }
            Err(e) => {
                eprintln!("[dockit] Failed to configure proxy '{}': {}", proxy_url, e);
            }
        };
    }

    builder.build().expect("Failed to build HTTP client")
}
