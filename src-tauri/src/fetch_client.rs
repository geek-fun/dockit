use std::collections::HashMap;
use std::option::Option;
use std::str::FromStr;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::json;

use crate::common::http_client::create_http_client;

static mut FETCH_SECURE_CLIENT: Option<reqwest::Client> = None;
static mut FETCH_INSECURE_CLIENT: Option<reqwest::Client> = None;

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
    let url_hint = e.url().map(|u| u.host_str().unwrap_or("unknown")).unwrap_or("unknown");
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
            format!("Invalid request to '{}'. Please check the connection settings. Detail: {}", url_hint, raw),
        );
    }

    ("UNKNOWN_ERROR", format!("Unexpected error connecting to '{}': {}", url_hint, raw))
}

#[tauri::command]
pub async fn fetch_api(url: String, options: FetchApiOptions) -> Result<String, String> {
    let client = unsafe {
        match options.agent.ssl {
            true => {
                if FETCH_SECURE_CLIENT.is_none() {
                    FETCH_SECURE_CLIENT = Option::from(create_http_client(
                        options.agent.http_proxy,
                        Some(options.agent.ssl),
                    ));
                }
                FETCH_SECURE_CLIENT.as_ref().unwrap()
            }
            false => {
                if FETCH_INSECURE_CLIENT.is_none() {
                    FETCH_INSECURE_CLIENT = Option::from(create_http_client(
                        options.agent.http_proxy,
                        Some(options.agent.ssl),
                    ));
                }
                FETCH_INSECURE_CLIENT.as_ref().unwrap()
            }
        }
    };

    let response = client
        .request(
            reqwest::Method::from_bytes(options.method.as_bytes()).unwrap(),
            &url,
        )
        .headers(headermap_from_hashmap(options.headers.iter()))
        .body(options.body.unwrap_or_default())
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
                        "Failed to fetch API".to_string()
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
