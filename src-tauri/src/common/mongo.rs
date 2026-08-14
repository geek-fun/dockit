use mongodb::{options::ClientOptions, Client as MongoClient};
use serde_json::Value;

fn build_mongo_uri(config: &Value) -> Result<String, String> {
    let auth_kind = config
        .get("authKind")
        .and_then(|v| v.as_str())
        .unwrap_or("none");

    if auth_kind == "uri" {
        return config
            .get("uri")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Missing uri in connection config".to_string());
    }

    let host = config
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or("localhost");
    let port = config.get("port").and_then(|v| v.as_u64()).unwrap_or(27017);
    let tls = config.get("tls").and_then(|v| v.as_bool()).unwrap_or(false);
    let database = config
        .get("database")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let db_path = if database.is_empty() {
        String::new()
    } else {
        format!("/{}", database)
    };

    let mut params: Vec<String> = Vec::new();
    if tls {
        params.push("tls=true".to_string());
    }

    if auth_kind == "scram" {
        let username = config
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let password = config
            .get("password")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let auth_source = config
            .get("authSource")
            .and_then(|v| v.as_str())
            .unwrap_or("admin");
        params.push(format!("authSource={}", auth_source));
        if let Some(mechanism) = config.get("authMechanism").and_then(|v| v.as_str()) {
            if !mechanism.is_empty() {
                params.push(format!("authMechanism={}", mechanism));
            }
        }
        let query = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        };
        Ok(format!(
            "mongodb://{}:{}@{}:{}{}{}",
            crate::common::validation::url_encode_segment(username),
            crate::common::validation::url_encode_segment(password),
            host,
            port,
            db_path,
            query
        ))
    } else {
        let query = if params.is_empty() {
            String::new()
        } else {
            format!("?{}", params.join("&"))
        };
        Ok(format!("mongodb://{}:{}{}{}", host, port, db_path, query))
    }
}

pub(crate) fn wire_socks5_proxy(client_options: &mut ClientOptions, host: &str, port: u16) {
    client_options.socks5_proxy = Some(
        mongodb::options::Socks5Proxy::builder()
            .host(host)
            .port(Some(port))
            .build(),
    );
    client_options.direct_connection = Some(true);
}

fn apply_socks5_proxy_from_config(
    client_options: &mut ClientOptions,
    socks5_proxy: Option<&str>,
) -> Result<(), String> {
    if let Some((host, port)) = crate::common::ssh_bridge::parse_socks5_proxy(socks5_proxy)? {
        wire_socks5_proxy(client_options, &host, port);
    }
    Ok(())
}

async fn build_client_options(config: &Value) -> Result<ClientOptions, String> {
    let uri = build_mongo_uri(config)?;
    let mut client_options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("Failed to parse MongoDB connection options: {}", e))?;
    let socks5_proxy = config.get("socks5Proxy").and_then(|v| v.as_str());
    apply_socks5_proxy_from_config(&mut client_options, socks5_proxy)?;
    Ok(client_options)
}

pub(crate) async fn create_mongo_client_from_config(
    config: &Value,
) -> Result<(MongoClient, String), String> {
    let database = config
        .get("database")
        .and_then(|v| v.as_str())
        .unwrap_or("test")
        .to_string();
    let client_options = build_client_options(config).await?;
    let client = MongoClient::with_options(client_options)
        .map_err(|e| format!("Failed to create MongoDB client: {}", e))?;
    Ok((client, database))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_mongo_uri_no_auth() {
        let uri = build_mongo_uri(&json!({"host": "localhost", "port": 27017})).unwrap();
        assert_eq!(uri, "mongodb://localhost:27017");
    }

    #[test]
    fn test_build_mongo_uri_with_db() {
        let uri =
            build_mongo_uri(&json!({"host": "localhost", "port": 27017, "database": "testdb"}))
                .unwrap();
        assert_eq!(uri, "mongodb://localhost:27017/testdb");
    }

    #[test]
    fn test_build_mongo_uri_with_tls() {
        let uri =
            build_mongo_uri(&json!({"host": "localhost", "port": 27017, "tls": true})).unwrap();
        assert_eq!(uri, "mongodb://localhost:27017?tls=true");
    }

    #[test]
    fn test_build_mongo_uri_uri_auth() {
        let uri = build_mongo_uri(
            &json!({"authKind": "uri", "uri": "mongodb+srv://cluster.mongodb.net"}),
        )
        .unwrap();
        assert_eq!(uri, "mongodb+srv://cluster.mongodb.net");
    }

    #[test]
    fn test_build_mongo_uri_uri_auth_missing_uri() {
        let err = build_mongo_uri(&json!({"authKind": "uri"})).unwrap_err();
        assert!(err.contains("Missing uri"), "got: {}", err);
    }

    #[test]
    fn test_build_mongo_uri_scram() {
        let uri = build_mongo_uri(&json!({
            "authKind": "scram", "host": "localhost", "port": 27017,
            "username": "admin", "password": "secret", "database": "mydb",
        }))
        .unwrap();
        assert!(
            uri.starts_with("mongodb://admin:secret@localhost:27017/mydb"),
            "got: {}",
            uri
        );
        assert!(uri.contains("authSource=admin"), "got: {}", uri);
    }

    #[test]
    fn test_build_mongo_uri_scram_with_mechanism() {
        let uri = build_mongo_uri(&json!({
            "authKind": "scram", "host": "localhost", "port": 27017,
            "username": "u", "password": "p", "authMechanism": "SCRAM-SHA-256",
        }))
        .unwrap();
        assert!(uri.contains("authMechanism=SCRAM-SHA-256"), "got: {}", uri);
    }

    #[test]
    fn test_build_mongo_uri_defaults() {
        let uri = build_mongo_uri(&json!({})).unwrap();
        assert_eq!(uri, "mongodb://localhost:27017");
    }

    #[tokio::test]
    async fn test_create_mongo_client_parses_uri_locally() {
        let result = create_mongo_client_from_config(&json!({
            "host": "localhost", "port": 27017, "database": "testdb",
        }))
        .await;
        assert!(
            result.is_ok(),
            "should parse URI and create lazy client: {:?}",
            result.err()
        );
        let (_client, db) = result.unwrap();
        assert_eq!(db, "testdb");
    }

    #[tokio::test]
    async fn test_create_mongo_client_tolerates_bad_uri() {
        let result = create_mongo_client_from_config(&json!({
            "authKind": "scram", "host": "", "port": 27017,
            "username": "", "password": "",
        }))
        .await;
        let _ = result; // May pass or fail — just ensure no panic
    }

    #[tokio::test]
    async fn test_create_mongo_client_uri_auth() {
        let result = create_mongo_client_from_config(&json!({
            "authKind": "uri", "uri": "mongodb://localhost:27017/test",
        }))
        .await;
        assert!(result.is_ok(), "URI auth should parse: {:?}", result.err());
        let (_client, db) = result.unwrap();
        assert_eq!(db, "test");
    }

    #[tokio::test]
    async fn test_apply_socks5_proxy_sets_fields() {
        let mut options = ClientOptions::parse("mongodb://localhost:27017")
            .await
            .unwrap();
        apply_socks5_proxy_from_config(&mut options, Some("127.0.0.1:51234")).unwrap();
        let proxy = options.socks5_proxy.expect("socks5_proxy must be set");
        assert_eq!(proxy.host, "127.0.0.1");
        assert_eq!(proxy.port, Some(51234));
        assert_eq!(options.direct_connection, Some(true));
    }

    #[tokio::test]
    async fn test_apply_socks5_proxy_none_no_changes() {
        let mut options = ClientOptions::parse("mongodb://localhost:27017")
            .await
            .unwrap();
        apply_socks5_proxy_from_config(&mut options, None).unwrap();
        assert!(options.socks5_proxy.is_none());
        assert!(options.direct_connection.is_none());
    }

    #[tokio::test]
    async fn test_apply_socks5_proxy_malformed_returns_err() {
        let mut options = ClientOptions::parse("mongodb://localhost:27017")
            .await
            .unwrap();
        let err = apply_socks5_proxy_from_config(&mut options, Some("invalid")).unwrap_err();
        assert!(err.contains("no port separator"), "got: {}", err);
    }

    #[tokio::test]
    async fn test_build_client_options_applies_socks5_proxy() {
        let options = build_client_options(&json!({
            "host": "ssh-mongo-test", "port": 27017,
            "socks5Proxy": "127.0.0.1:51234",
        }))
        .await
        .expect("options should build");
        let proxy = options.socks5_proxy.expect("socks5_proxy must be set");
        assert_eq!(proxy.host, "127.0.0.1");
        assert_eq!(proxy.port, Some(51234));
        assert_eq!(options.direct_connection, Some(true));
    }

    #[tokio::test]
    async fn test_build_client_options_no_socks5_no_proxy() {
        let options = build_client_options(&json!({
            "host": "127.0.0.1", "port": 27018,
        }))
        .await
        .expect("options should build");
        assert!(options.socks5_proxy.is_none());
        assert!(options.direct_connection.is_none());
    }

    #[tokio::test]
    async fn test_build_client_options_uri_auth_with_socks5() {
        let options = build_client_options(&json!({
            "authKind": "uri",
            "uri": "mongodb://u:p@mongo.example.com:27018/app",
            "socks5Proxy": "127.0.0.1:51234",
        }))
        .await
        .expect("options should build");
        let proxy = options.socks5_proxy.expect("socks5_proxy must be set");
        assert_eq!(proxy.host, "127.0.0.1");
        assert_eq!(proxy.port, Some(51234));
        assert_eq!(options.direct_connection, Some(true));
    }

    #[tokio::test]
    async fn test_create_mongo_client_with_socks5_proxy() {
        let result = create_mongo_client_from_config(&json!({
            "host": "ssh-mongo-test", "port": 27017, "database": "testdb",
            "socks5Proxy": "127.0.0.1:51234",
        }))
        .await;
        assert!(result.is_ok(), "should build client: {:?}", result.err());
        let (_client, db) = result.unwrap();
        assert_eq!(db, "testdb");
    }

    #[tokio::test]
    async fn test_create_mongo_client_socks5_malformed_returns_err() {
        let result = create_mongo_client_from_config(&json!({
            "host": "ssh-mongo-test", "port": 27017,
            "socks5Proxy": "invalid",
        }))
        .await;
        let err = result.unwrap_err();
        assert!(err.contains("no port separator"), "got: {}", err);
    }
}
