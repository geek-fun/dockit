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
    let port = config
        .get("port")
        .and_then(|v| v.as_u64())
        .unwrap_or(27017);
    let tls = config
        .get("tls")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
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

pub(crate) async fn create_mongo_client_from_config(
    config: &Value,
) -> Result<(MongoClient, String), String> {
    let uri = build_mongo_uri(config)?;
    let database = config
        .get("database")
        .and_then(|v| v.as_str())
        .unwrap_or("test")
        .to_string();
    let client_options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("Failed to parse MongoDB connection options: {}", e))?;
    let client = MongoClient::with_options(client_options)
        .map_err(|e| format!("Failed to create MongoDB client: {}", e))?;
    Ok((client, database))
}
