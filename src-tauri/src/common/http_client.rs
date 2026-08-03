use std::env;
use std::net::SocketAddr;
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
            env::var("all_proxy")
                .ok()
                .filter(|p| p.starts_with("http://"))
        })
}

const CONNECT_TIMEOUT_SECS: u64 = 15;

/// Detect the system proxy that would route traffic to `host:port`, using
/// hyper-util's OS-aware matcher: environment variables first, then the
/// macOS network configuration (SCDynamicStore) or the Windows registry.
/// Honors NO_PROXY / the OS exception list for the target host.
pub fn system_proxy_for(host: &str, port: u16) -> Option<String> {
    use hyper_util::client::proxy::matcher::Matcher;

    let matcher = Matcher::from_system();
    for scheme in ["https", "http"] {
        let uri: http::Uri = format!("{scheme}://{host}:{port}").parse().ok()?;
        if let Some(intercept) = matcher.intercept(&uri) {
            // hyper-util's macOS matcher ignores the OS ExceptionsList, so
            // honor it here: exempted targets bypass the proxy entirely.
            if macos_proxy_exempts(host) {
                return None;
            }
            return Some(intercept.uri().to_string());
        }
    }
    None
}

/// Match a host against one macOS ExceptionsList entry: exact hostname,
/// "*.suffix" wildcard, or IPv4 CIDR.
fn proxy_exempt_matches(host: &str, pattern: &str) -> bool {
    if let Some(rest) = pattern.strip_prefix("*.") {
        return host == rest || host.ends_with(&format!(".{}", rest));
    }
    if let Some((cidr, bits)) = pattern.split_once('/') {
        let (Ok(ip), Ok(bits)) = (host.parse::<std::net::Ipv4Addr>(), bits.parse::<u8>()) else {
            return false;
        };
        let Some(base) = cidr.parse::<std::net::Ipv4Addr>().ok() else {
            return false;
        };
        let mask = if bits == 0 {
            0
        } else {
            u32::MAX << (32 - bits)
        };
        let base_u = u32::from(base) & mask;
        return u32::from(ip) & mask == base_u;
    }
    host == pattern
}

#[cfg(target_os = "macos")]
fn macos_proxy_exempts(host: &str) -> bool {
    use system_configuration::core_foundation::array::CFArray;
    use system_configuration::core_foundation::base::TCFType;
    use system_configuration::core_foundation::string::CFString;
    use system_configuration::dynamic_store::SCDynamicStoreBuilder;
    use system_configuration::sys::schema_definitions::kSCPropNetProxiesExceptionsList;

    let Some(store) = SCDynamicStoreBuilder::new("dockit").build() else {
        return false;
    };
    let Some(proxies) = store.get_proxies() else {
        return false;
    };
    let Some(exceptions) = proxies.find(unsafe { kSCPropNetProxiesExceptionsList }) else {
        return false;
    };
    let Some(list) = exceptions.downcast::<CFArray<*const std::ffi::c_void>>() else {
        return false;
    };
    for i in 0..list.len() {
        let item = unsafe { list.get_unchecked(i) };
        let cfstring = unsafe { CFString::wrap_under_get_rule(*item as *const _) };
        if proxy_exempt_matches(host, &cfstring.to_string()) {
            return true;
        }
    }
    false
}

#[cfg(not(target_os = "macos"))]
fn macos_proxy_exempts(_host: &str) -> bool {
    false
}

/// Detect the system proxy for an arbitrary target, or null when none is
/// configured. Used by the UI to offer "use system proxy" on SSH tunnels.
#[tauri::command]
pub async fn detect_system_proxy() -> Result<Option<String>, String> {
    Ok(system_proxy_for("proxy-check.invalid", 443))
}

pub fn create_http_client(
    proxy_mode: &str,
    proxy_url: Option<String>,
    ssl: Option<bool>,
    request_timeout: Option<Duration>,
    dns_override: Option<(String, SocketAddr)>,
    extra_root_certs: Option<Vec<reqwest::Certificate>>,
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
                        log::warn!("Failed to configure proxy '{}': {}", proxy_url, e);
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

    if let Some((domain, addr)) = dns_override {
        builder = builder.resolve(&domain, addr);
    }

    if let Some(certs) = extra_root_certs {
        for cert in certs {
            builder = builder.add_root_certificate(cert);
        }
    }

    builder.build().expect("Failed to build HTTP client")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_proxy_explicit() {
        assert_eq!(
            get_proxy(Some("http://proxy:8080".into())),
            Some("http://proxy:8080".into())
        );
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
    fn test_proxy_exempt_exact_host() {
        assert!(proxy_exempt_matches("127.0.0.1", "127.0.0.1"));
        assert!(!proxy_exempt_matches("127.0.0.2", "127.0.0.1"));
        assert!(!proxy_exempt_matches("localhost", "127.0.0.1"));
    }

    #[test]
    fn test_proxy_exempt_wildcard_suffix() {
        assert!(proxy_exempt_matches("internal.corp.local", "*.local"));
        assert!(proxy_exempt_matches("corp.local", "*.local"));
        assert!(!proxy_exempt_matches("corp.local.evil.com", "*.local"));
        assert!(!proxy_exempt_matches("evilcorp.localhost", "*.local"));
    }

    #[test]
    fn test_proxy_exempt_cidr() {
        assert!(proxy_exempt_matches("10.1.2.3", "10.0.0.0/8"));
        assert!(proxy_exempt_matches("192.168.1.5", "192.168.0.0/16"));
        assert!(proxy_exempt_matches("172.20.0.4", "172.16.0.0/12"));
        assert!(!proxy_exempt_matches("11.1.2.3", "10.0.0.0/8"));
        assert!(!proxy_exempt_matches("192.169.1.5", "192.168.0.0/16"));
        assert!(!proxy_exempt_matches("8.8.8.8", "10.0.0.0/8"));
    }

    #[test]
    fn test_proxy_exempt_non_ip_cidr_pattern() {
        // A CIDR pattern against a non-IP host does not match
        assert!(!proxy_exempt_matches("bastion.corp.com", "10.0.0.0/8"));
    }

    #[test]
    fn test_create_http_client_default_mode() {
        let client = create_http_client("system", None, None, None, None, None);
        // Should return a valid client without panicking
        let _ = client;
    }

    #[test]
    fn test_create_http_client_no_proxy_mode() {
        let client = create_http_client("none", None, None, None, None, None);
        let _ = client;
    }

    #[test]
    fn test_create_http_client_manual_proxy() {
        let client = create_http_client(
            "manual",
            Some("http://proxy:8080".into()),
            Some(true),
            None,
            None,
            None,
        );
        let _ = client;
    }

    #[test]
    fn test_create_http_client_with_timeout() {
        let client = create_http_client(
            "system",
            None,
            None,
            Some(Duration::from_secs(30)),
            None,
            None,
        );
        let _ = client;
    }
}
