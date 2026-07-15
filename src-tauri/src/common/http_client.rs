use std::env;
use std::time::Duration;

fn get_proxy(http_proxy: Option<String>) -> Option<String> {
    if let Some(proxy) = http_proxy {
        if !proxy.is_empty() {
            return Some(proxy);
        }
    }
    env::var("HTTPS_PROXY")
        .ok()
        .or_else(|| env::var("https_proxy").ok())
        .or_else(|| env::var("HTTP_PROXY").ok())
        .or_else(|| env::var("http_proxy").ok())
        .or_else(|| {
            env::var("all_proxy").ok().filter(|p| p.starts_with("http://"))
        })
}

const CONNECT_TIMEOUT_SECS: u64 = 15;

/// Detect system proxy from environment variables.
/// Returns the first found proxy URL, or null.
#[tauri::command]
pub async fn detect_system_proxy() -> Result<Option<String>, String> {
    // Check env vars in priority order: HTTPS_PROXY, https_proxy, HTTP_PROXY, http_proxy, all_proxy
    let proxy = std::env::var("HTTPS_PROXY")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| std::env::var("https_proxy").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("HTTP_PROXY").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("http_proxy").ok().filter(|s| !s.is_empty()))
        .or_else(|| std::env::var("all_proxy").ok().filter(|s| s.starts_with("http://")));
    Ok(proxy)
}

pub fn create_http_client(
    proxy_mode: &str,
    proxy_url: Option<String>,
    ssl: Option<bool>,
    request_timeout: Option<Duration>,
) -> reqwest::Client {
    let mut builder = reqwest::ClientBuilder::new()
        .danger_accept_invalid_certs(!ssl.unwrap_or(true))
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .no_proxy();

    if let Some(duration) = request_timeout {
        builder = builder.timeout(duration);
    }

    match proxy_mode {
        "manual" => {
            if let Some(proxy_url) = get_proxy(proxy_url) {
                match reqwest::Proxy::all(&proxy_url) {
                    Ok(proxy) => {
                        builder = builder.proxy(proxy);
                    }
                    Err(e) => {
                        eprintln!("[dockit] Failed to configure proxy '{}': {}", proxy_url, e);
                    }
                };
            }
        }
        "none" => {
            // no_proxy() already called on builder above — no proxy used
        }
        _ => {
            // "system" (default): let reqwest auto-detect from OS proxy settings.
            // Re-build without no_proxy() so system-proxy feature takes effect.
            builder = reqwest::ClientBuilder::new()
                .danger_accept_invalid_certs(!ssl.unwrap_or(true))
                .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS));
            if let Some(duration) = request_timeout {
                builder = builder.timeout(duration);
            }
        }
    }

    builder.build().expect("Failed to build HTTP client")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_proxy_explicit() {
        assert_eq!(get_proxy(Some("http://proxy:8080".into())), Some("http://proxy:8080".into()));
    }

    #[test]
    fn test_get_proxy_explicit_empty() {
        // Empty explicit proxy falls through to env vars — test that it doesn't crash
        let result = get_proxy(Some("".into()));
        // Result depends on env vars — just ensure no panic and valid type
        let _: Option<String> = result;
    }

    #[test]
    fn test_get_proxy_none() {
        // No explicit proxy and no env vars set
        let result = get_proxy(None);
        let _: Option<String> = result;
    }

    #[test]
    fn test_create_http_client_default_mode() {
        let client = create_http_client("system", None, None, None);
        // Should return a valid client without panicking
        let _ = client;
    }

    #[test]
    fn test_create_http_client_no_proxy_mode() {
        let client = create_http_client("none", None, None, None);
        let _ = client;
    }

    #[test]
    fn test_create_http_client_manual_proxy() {
        let client = create_http_client("manual", Some("http://proxy:8080".into()), Some(true), None);
        let _ = client;
    }

    #[test]
    fn test_create_http_client_with_timeout() {
        let client = create_http_client("system", None, None, Some(Duration::from_secs(30)));
        let _ = client;
    }
}
