use std::collections::HashMap;
use std::str::FromStr;
use std::sync::OnceLock;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::Manager;

use crate::common::http_client::create_http_client;

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
    ssh: Option<Value>,
) -> Result<String, String> {
    // Extract system proxy from SSH config if present
    let system_proxy = ssh.as_ref()
        .and_then(|s| s.get("systemProxy"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let (final_url, cleanup_key) = if let Some(ref ssh_config) = ssh {
        resolve_url_via_ssh(&app, &url, ssh_config).await?
    } else {
        (url, String::new())
    };

    let result = fetch_raw(&app, &final_url, &options, system_proxy).await;

    if !cleanup_key.is_empty() {
        let tunnels: tauri::State<crate::ssh::TunnelManager> = app.state::<crate::ssh::TunnelManager>();
        tunnels.inner().stop_tunnel(&cleanup_key).await;
    }
    result
}

async fn fetch_raw(
    _app: &tauri::AppHandle,
    url: &str,
    options: &FetchApiOptions,
    system_proxy: Option<String>,
) -> Result<String, String> {
    // When URL points to localhost (e.g. SSH tunnel), bypass proxy
    let is_local = url.contains("127.0.0.1") || url.contains("localhost");
    let proxy_url = if is_local { None } else { system_proxy.or_else(|| options.agent.http_proxy.clone()) };
    let has_explicit_proxy = proxy_url.as_deref().is_some_and(|p| !p.is_empty());
    let client = if has_explicit_proxy {
        create_http_client("manual", proxy_url, Some(options.agent.ssl), None)
    } else if is_local {
        create_http_client("none", None, Some(options.agent.ssl), None)
    } else if options.agent.ssl {
        create_http_client("system", options.agent.http_proxy.clone(), Some(options.agent.ssl), None)
    } else if options.agent.ssl {
        SECURE_CLIENT
            .get_or_init(|| create_http_client("system", None, Some(true), None))
            .clone()
    } else {
        INSECURE_CLIENT
            .get_or_init(|| create_http_client("system", None, Some(false), None))
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

/// Resolve SSH tunnel and rewrite the URL to point to the tunnel endpoint.
/// Returns (new_url, tunnel_cleanup_key).
async fn resolve_url_via_ssh(
    app: &tauri::AppHandle,
    url: &str,
    ssh_config: &Value,
) -> Result<(String, String), String> {
    use crate::common::ssh_bridge::resolve_connection_target;
    use url::Url;

    // Frontend buildURL() produces scheme-less URLs like "host:port/path".
    // Url::parse needs a scheme, so prepend http:// if missing.
    let normalized = if url.contains("://") { url.to_string() } else { format!("http://{}", url) };
    let parsed = Url::parse(&normalized).map_err(|e| format!("Invalid URL: {}", e))?;
    let host = parsed.host_str().unwrap_or("localhost").to_string();
    let port = parsed.port_or_known_default().unwrap_or(9200);

    let conn_val = serde_json::json!({
        "host": host,
        "port": port,
        "ssh": ssh_config,
    });

    let tunnels: tauri::State<crate::ssh::TunnelManager> = app.state::<crate::ssh::TunnelManager>();
    let cid = format!("http-{}", uuid::Uuid::new_v4());

    let (new_host, new_port) = resolve_connection_target(app, &conn_val, &cid, tunnels.inner()).await?;

    let scheme = parsed.scheme();
    let new_url = match parsed.query() {
        Some(q) => format!("{}://{}:{}{}?{}", scheme, new_host, new_port, parsed.path(), q),
        None => format!("{}://{}:{}{}", scheme, new_host, new_port, parsed.path()),
    };

    Ok((new_url, cid))
}
