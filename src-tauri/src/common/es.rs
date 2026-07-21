use base64::Engine;
use serde_json::Value;

pub(crate) fn build_es_base_url(config: &Value) -> Result<String, String> {
    let host_raw = config
        .get("host")
        .and_then(|v| v.as_str())
        .ok_or("Missing host in connection config")?;
    let port = config
        .get("port")
        .and_then(|v| v.as_u64())
        .ok_or("Missing port in connection config")?;
    let host = host_raw.trim().trim_start_matches("http://").trim_start_matches("https://");
    if host.is_empty() {
        return Err("Host is empty after trimming URL scheme".to_string());
    }
    let protocol = if get_es_ssl_flag(config) { "https" } else { "http" };
    Ok(format!("{}://{}:{}", protocol, host, port))
}

/// Build ES base URL with SSH tunnel support.
/// Uses resolved host/port directly instead of reading from config,
/// and includes the protocol scheme (http/https).
pub fn build_es_base_url_tunneled(resolved_host: &str, resolved_port: u16, ssl: bool) -> String {
    let protocol = if ssl { "https" } else { "http" };
    format!("{}://{}:{}", protocol, resolved_host, resolved_port)
}

pub(crate) fn build_es_headers(config: &Value) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "Content-Type",
        "application/json".parse().expect("valid header"),
    );

    let auth_type = config
        .get("authType")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match auth_type {
        "basic" => {
            let username = config
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let password = config
                .get("password")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let encoded = base64::engine::general_purpose::STANDARD
                .encode(format!("{}:{}", username, password));
            if let Ok(val) = format!("Basic {}", encoded).parse() {
                headers.insert("Authorization", val);
            }
        }
        "apiKey" => {
            let api_key = config.get("apiKey").and_then(|v| v.as_str()).unwrap_or("");
            if let Ok(val) = format!("ApiKey {}", api_key).parse() {
                headers.insert("Authorization", val);
            }
        }
        _ => {}
    }

    headers
}

pub(crate) fn get_es_ssl_flag(config: &Value) -> bool {
    config
        .get("sslCertVerification")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_es_base_url_valid() {
        let config = json!({"host": "localhost", "port": 9200});
        assert_eq!(build_es_base_url(&config).unwrap(), "http://localhost:9200");
    }

    #[test]
    fn test_build_es_base_url_https_when_ssl_flag_true() {
        let config = json!({"host": "es.example.com", "port": 9200, "sslCertVerification": true});
        assert_eq!(build_es_base_url(&config).unwrap(), "https://es.example.com:9200");
    }

    #[test]
    fn test_build_es_base_url_http_when_ssl_flag_false() {
        let config = json!({"host": "https://es.example.com", "port": 9200, "sslCertVerification": false});
        assert_eq!(build_es_base_url(&config).unwrap(), "http://es.example.com:9200");
    }

    #[test]
    fn test_build_es_base_url_empty_host_after_trim() {
        let config = json!({"host": "https://", "port": 9200});
        assert!(build_es_base_url(&config).is_err());
    }

    #[test]
    fn test_build_es_base_url_missing_host() {
        assert!(build_es_base_url(&json!({"port": 9200})).is_err());
    }

    #[test]
    fn test_build_es_base_url_missing_port() {
        assert!(build_es_base_url(&json!({"host": "localhost"})).is_err());
    }

    #[test]
    fn test_build_es_headers_no_auth() {
        let headers = build_es_headers(&json!({}));
        assert!(headers.get("Authorization").is_none());
        assert_eq!(headers.get("Content-Type").unwrap(), "application/json");
    }

    #[test]
    fn test_build_es_headers_basic() {
        let h = build_es_headers(&json!({"authType": "basic", "username": "u", "password": "p"}));
        assert!(h.get("Authorization").unwrap().to_str().unwrap().starts_with("Basic "));
    }

    #[test]
    fn test_build_es_headers_api_key() {
        let h = build_es_headers(&json!({"authType": "apiKey", "apiKey": "k123"}));
        assert_eq!(h.get("Authorization").unwrap().to_str().unwrap(), "ApiKey k123");
    }

    #[test]
    fn test_get_es_ssl_flag_true() {
        assert!(get_es_ssl_flag(&json!({"sslCertVerification": true})));
    }

    #[test]
    fn test_get_es_ssl_flag_false() {
        assert!(!get_es_ssl_flag(&json!({"sslCertVerification": false})));
    }

    #[test]
    fn test_get_es_ssl_flag_default() {
        assert!(!get_es_ssl_flag(&json!({})));
    }
}
