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

/// Build an HTTP client with connect timeout for general use.
/// Safe for streaming and long-running requests.
pub fn create_http_client(proxy: Option<String>, ssl: Option<bool>) -> reqwest::Client {
    build_client(proxy, ssl, None)
}

/// Build an HTTP client with an additional request-level timeout.
/// Use only for short, non-streaming requests like validation or model listing.
pub fn create_short_http_client(proxy: Option<String>, ssl: Option<bool>, timeout_secs: u64) -> reqwest::Client {
    build_client(proxy, ssl, Some(Duration::from_secs(timeout_secs)))
}

fn build_client(proxy: Option<String>, ssl: Option<bool>, request_timeout: Option<Duration>) -> reqwest::Client {
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
