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
const REQUEST_TIMEOUT_SECS: u64 = 30;

pub fn create_http_client(proxy: Option<String>, ssl: Option<bool>) -> reqwest::Client {
    let mut builder = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(!ssl.unwrap_or(true))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS));

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

    builder.build().unwrap_or_else(|e| {
        eprintln!("[dockit] Failed to build HTTP client: {}", e);
        reqwest::Client::new()
    })
}
