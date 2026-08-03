use std::collections::HashMap;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::OnceLock;

use crate::common::http_client::create_http_client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Value};

static SECURE_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static INSECURE_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Deserialize)]
struct Agent {
    ssl: bool,
    http_proxy: Option<String>,
}

#[derive(Deserialize)]
pub struct FetchApiOptions {
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    agent: Agent,
}

/// Tunnel routing info for a request: keep the original hostname in the URL
/// (SNI / certificate validation) while TCP goes to the local tunnel port
/// (port-forward mode) or through the local SOCKS5 proxy (Socks5 mode).
struct TunnelTarget {
    hostname: String,
    local_port: u16,
    socks5_proxy: Option<String>,
}

fn headermap_from_hashmap<'a, I, S>(headers: I) -> HeaderMap
where
    I: Iterator<Item = (S, S)> + 'a,
    S: AsRef<str> + 'a,
{
    headers
        .map(|(name, val)| {
            (
                HeaderName::from_str(name.as_ref()),
                HeaderValue::from_str(val.as_ref()),
            )
        })
        // We ignore the errors here. If you want to get a list of failed conversions, you can use Iterator::partition
        // to help you out here
        .filter(|(k, v)| k.is_ok() && v.is_ok())
        .map(|(k, v)| (k.unwrap(), v.unwrap()))
        .collect()
}

/// Categorize a reqwest error into a user-friendly type and message
fn categorize_request_error(e: &reqwest::Error) -> (&'static str, String) {
    let url_hint = e
        .url()
        .map(|u| u.host_str().unwrap_or("unknown"))
        .unwrap_or("unknown");
    let raw = format!("{}", e);

    if e.is_connect() {
        // Drill into source chain for more specific errors
        let source_chain = format!("{:?}", e);

        if source_chain.contains("dns error")
            || source_chain.contains("Name or service not known")
            || source_chain.contains("nodename nor servname provided")
            || source_chain.contains("getaddrinfo")
            || source_chain.contains("No such host")
            || source_chain.contains("failed to lookup address")
        {
            return (
                "DNS_ERROR",
                format!("Cannot resolve hostname '{}'. Please verify the host address is correct and the DNS is reachable.", url_hint),
            );
        }

        if source_chain.contains("Connection refused")
            || source_chain.contains("connection refused")
        {
            return (
                "CONNECTION_REFUSED",
                format!("Connection refused by '{}'. Please verify the host and port are correct and the service is running.", url_hint),
            );
        }

        if source_chain.contains("certificate")
            || source_chain.contains("SSL")
            || source_chain.contains("tls")
            || source_chain.contains("HandshakeFailure")
            || source_chain.contains("CertificateRequired")
        {
            return (
                "SSL_ERROR",
                format!("SSL/TLS error connecting to '{}'. Try disabling SSL verification or check the server's certificate.", url_hint),
            );
        }

        return (
            "CONNECTION_ERROR",
            format!("Failed to connect to '{}'. Please check the host, port, and network connectivity. Detail: {}", url_hint, raw),
        );
    }

    if e.is_timeout() {
        return (
            "TIMEOUT",
            format!("Connection to '{}' timed out. The server may be unreachable or too slow to respond.", url_hint),
        );
    }

    if e.is_request() {
        return (
            "REQUEST_ERROR",
            format!(
                "Invalid request to '{}'. Please check the connection settings. Detail: {}",
                url_hint, raw
            ),
        );
    }

    (
        "UNKNOWN_ERROR",
        format!("Unexpected error connecting to '{}': {}", url_hint, raw),
    )
}

#[tauri::command]
pub async fn fetch_api(
    app: tauri::AppHandle,
    url: String,
    options: FetchApiOptions,
    ssh_tunnel: Option<Value>,
) -> Result<String, String> {
    // Extract system proxy from SSH config if present
    let system_proxy = ssh_tunnel
        .as_ref()
        .and_then(|s| s.get("systemProxy"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let (final_url, tunnel) = if let Some(ref ssh_config) = ssh_tunnel {
        resolve_url_via_ssh(&app, &url, ssh_config).await?
    } else {
        (url, None)
    };

    fetch_raw(&final_url, &options, system_proxy, tunnel, None).await
}

async fn fetch_raw(
    url: &str,
    options: &FetchApiOptions,
    system_proxy: Option<String>,
    tunnel: Option<TunnelTarget>,
    extra_root_certs: Option<Vec<reqwest::Certificate>>,
) -> Result<String, String> {
    // When URL points to localhost (e.g. SSH tunnel), bypass proxy
    let is_local = url.contains("127.0.0.1") || url.contains("localhost");
    let proxy_url = if is_local {
        None
    } else {
        system_proxy.or_else(|| options.agent.http_proxy.clone())
    };
    let has_explicit_proxy = proxy_url.as_deref().is_some_and(|p| !p.is_empty());
    let client = if let Some(t) = tunnel {
        // Tunneled requests keep the original hostname for TLS. Socks5 mode
        // routes through the explicit proxy; port-forward mode uses a DNS
        // override to the local tunnel port.
        match t.socks5_proxy {
            Some(proxy) => create_http_client(
                "manual",
                Some(format!("socks5h://{}", proxy)),
                Some(options.agent.ssl),
                None,
                None,
                extra_root_certs,
            ),
            None => create_http_client(
                "none",
                None,
                Some(options.agent.ssl),
                None,
                Some((t.hostname, SocketAddr::from(([127, 0, 0, 1], t.local_port)))),
                extra_root_certs,
            ),
        }
    } else if has_explicit_proxy {
        create_http_client(
            "manual",
            proxy_url,
            Some(options.agent.ssl),
            None,
            None,
            None,
        )
    } else if is_local {
        create_http_client("none", None, Some(options.agent.ssl), None, None, None)
    } else if options.agent.ssl {
        SECURE_CLIENT
            .get_or_init(|| create_http_client("system", None, Some(true), None, None, None))
            .clone()
    } else {
        INSECURE_CLIENT
            .get_or_init(|| create_http_client("system", None, Some(false), None, None, None))
            .clone()
    };

    let response = client
        .request(
            reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(),
            url,
        )
        .headers(headermap_from_hashmap(options.headers.iter()))
        .body(options.body.clone().unwrap_or_default())
        .send()
        .await;

    match response {
        Ok(resp) => {
            let status_code = resp.status().as_u16();
            let is_success = resp.status().is_success();
            let body = resp.text().await;
            match body {
                Ok(body) => {
                    let data: serde_json::Value =
                        serde_json::from_str(&body).unwrap_or(json!(&body));
                    let message = if is_success {
                        "Success".to_string()
                    } else {
                        format!("Failed to fetch API (HTTP {})", status_code)
                    };
                    let result = json!({
                        "status": status_code,
                        "message": message,
                        "data": data
                    });
                    Ok(result.to_string())
                }
                Err(e) => {
                    let result = json!({
                        "status": 500,
                        "message": format!("Failed to read response body {}", e),
                        "data": Option::<serde_json::Value>::None,
                    });
                    Err(result.to_string())
                }
            }
        }
        Err(e) => {
            let (error_type, user_message) = categorize_request_error(&e);
            let result = json!({
                "status": 500,
                "message": user_message,
                "error_type": error_type,
                "data": Option::<serde_json::Value>::None,
            });
            Err(result.to_string())
        }
    }
}

/// Resolve SSH tunnel and keep the original URL hostname (TLS SNI /
/// certificate validation) while routing TCP through the local tunnel
/// endpoint via a DNS override. When tunneled, the URL port is rewritten
/// to the local tunnel port: reqwest always uses the URL port for the
/// connection (the resolve() override only replaces the IP).
async fn resolve_url_via_ssh(
    app: &tauri::AppHandle,
    url: &str,
    ssh_config: &Value,
) -> Result<(String, Option<TunnelTarget>), String> {
    use crate::common::ssh_bridge::resolve_ssh_tunnel;
    use url::Url;

    // Frontend buildURL() produces scheme-less URLs like "host:port/path".
    // Url::parse needs a scheme, so prepend http:// if missing.
    let normalized = if url.contains("://") {
        url.to_string()
    } else {
        format!("http://{}", url)
    };
    let parsed = Url::parse(&normalized).map_err(|e| format!("Invalid URL: {}", e))?;
    let host = parsed.host_str().unwrap_or("localhost").to_string();
    let port = parsed.port_or_known_default().unwrap_or(9200);

    let endpoint = resolve_ssh_tunnel(app, Some(ssh_config), &host, port).await?;
    let ssh_enabled = ssh_config
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    // Only treat the request as tunneled when a tunnel was actually
    // established (endpoint host is 127.0.0.1); with no enabled layers the
    // endpoint equals the remote target and we must connect directly.
    let socks5_proxy = endpoint.socks5_port.map(|p| format!("127.0.0.1:{}", p));
    let tunnel_established = endpoint.host == "127.0.0.1" || endpoint.socks5_port.is_some();
    let tunnel = (ssh_enabled && tunnel_established).then_some(TunnelTarget {
        hostname: host,
        local_port: endpoint.port,
        socks5_proxy,
    });

    // Socks5 mode keeps the URL untouched (real host + real port): the
    // proxy routes TCP, TLS still sees the real hostname.
    let final_url = if ssh_enabled && endpoint.socks5_port.is_none() {
        let mut tunneled = parsed;
        tunneled
            .set_port(Some(endpoint.port))
            .map_err(|_| "Failed to set tunnel port".to_string())?;
        tunneled.to_string()
    } else {
        url.to_string()
    };

    Ok((final_url, tunnel))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// S2: a tunneled HTTPS request must keep the original hostname for TLS
    /// (SNI / certificate validation) while TCP goes to the local tunnel
    /// endpoint. reqwest resolves the IP via the override but uses the URL
    /// port, so the tunneled URL carries the local tunnel port (regression
    /// for #472 — the legacy bare-IP URL fails the handshake, proven by
    /// tls_test_server::negative_control).
    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_fetch_raw_tunnel_preserves_hostname_for_tls() {
        use crate::common::tls_test_server::{spawn_tls_server, test_root_certificate};

        let addr = spawn_tls_server().await;
        let tunnel = TunnelTarget {
            hostname: "es.example.com".to_string(),
            local_port: addr.port(),
            socks5_proxy: None,
        };
        let options = FetchApiOptions {
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            agent: Agent {
                ssl: true,
                http_proxy: None,
            },
        };

        let result = fetch_raw(
            &format!("https://es.example.com:{}/", addr.port()),
            &options,
            None,
            Some(tunnel),
            Some(vec![test_root_certificate()]),
        )
        .await;

        assert!(
            result.is_ok(),
            "tunneled TLS fetch must succeed, got: {:?}",
            result.err()
        );
        assert!(result.unwrap().contains("\"status\":200"));
    }

    /// S4: Socks5 mode routes through a real local SOCKS5 proxy while the
    /// URL keeps the real hostname (wiremock as the target server).
    #[tokio::test]
    async fn test_fetch_raw_socks5_via_real_socks5_proxy() {
        use crate::ssh::socks5::{run_socks5_server, DuplexStream, OutboundFn};
        use std::sync::Arc;
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"socks5":"ok"}"#))
            .mount(&server)
            .await;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let socks_port = listener.local_addr().unwrap().port();
        // Outbound pins to the wiremock server regardless of the CONNECT
        // target — proves the request reached the proxy with the real
        // hostname intact (socks5h would otherwise resolve it remotely).
        let target_addr = *server.address();
        let outbound: OutboundFn = Arc::new(move |_host: &str, _port: u16| {
            let target = target_addr;
            Box::pin(async move {
                let stream = tokio::net::TcpStream::connect((target.ip(), target.port()))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(Box::new(stream) as Box<dyn DuplexStream>)
            })
        });
        tokio::spawn(run_socks5_server(listener, outbound));

        let tunnel = TunnelTarget {
            hostname: "es.example.com".to_string(),
            local_port: 0,
            socks5_proxy: Some(format!("127.0.0.1:{}", socks_port)),
        };
        let options = FetchApiOptions {
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            agent: Agent {
                ssl: false,
                http_proxy: None,
            },
        };

        let result = fetch_raw(
            &format!("http://es.example.com:{}/", server.address().port()),
            &options,
            None,
            Some(tunnel),
            None,
        )
        .await;

        assert!(
            result.is_ok(),
            "Socks5 fetch must succeed, got: {:?}",
            result.err()
        );
        assert!(result.unwrap().contains("socks5"));
    }

    /// S3: plain-HTTP tunneled request routes through the local tunnel
    /// endpoint via the resolve() override (wiremock on 127.0.0.1).
    #[tokio::test]
    async fn test_fetch_raw_tunnel_plain_http_via_wiremock() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"hello":"world"}"#))
            .mount(&server)
            .await;

        let tunnel = TunnelTarget {
            hostname: "es.example.com".to_string(),
            local_port: server.address().port(),
            socks5_proxy: None,
        };
        let options = FetchApiOptions {
            method: "GET".to_string(),
            headers: HashMap::new(),
            body: None,
            agent: Agent {
                ssl: false,
                http_proxy: None,
            },
        };

        let result = fetch_raw(
            &format!("http://es.example.com:{}/", server.address().port()),
            &options,
            None,
            Some(tunnel),
            None,
        )
        .await;

        assert!(
            result.is_ok(),
            "tunneled HTTP fetch must succeed, got: {:?}",
            result.err()
        );
        assert!(result.unwrap().contains("hello"));
    }
}
