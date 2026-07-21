use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

/// Resolves connection configurations from the persistent store by
/// connection ID. Keeps credentials on the Rust side — the frontend
/// never sees them.
pub struct ConnectionResolver;

impl ConnectionResolver {
    /// Look up a connection by its numeric ID from the `.store.dat` file
    /// and normalize it to the flat config format that capability handlers
    /// expect.
    ///
    /// The store contains connections in their TypeScript shape:
    /// ```json
    /// { "id": 42, "type": "ELASTICSEARCH", "host": "...", "port": 9200,
    ///   "authType": "basic", "username": "...", "password": "...", ... }
    /// ```
    pub fn resolve(app: &AppHandle, connection_id: &str) -> Result<Value, String> {
        let store = app
            .store(".store.dat")
            .map_err(|e| format!("Failed to open store: {}", e))?;

        // The store key "connections" holds a JSON array of connection objects
        let all_connections = store
            .get("connections")
            .and_then(|v| v.as_array().cloned())
            .ok_or_else(|| "No connections found in store".to_string())?;

        let id: i64 = connection_id
            .parse()
            .map_err(|_| format!("Invalid connection_id: {}", connection_id))?;

        let connection = all_connections
            .into_iter()
            .find(|c| c.get("id").and_then(|v| v.as_i64()) == Some(id))
            .ok_or_else(|| format!("Connection '{}' not found in store", connection_id))?;

        normalize_config(connection)
    }
}

/// Convert a stored connection object (in TypeScript shape) into the flat
/// config format that Rust capability handlers expect.
fn normalize_config(connection: Value) -> Result<Value, String> {
    let db_type = connection
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Connection missing 'type' field".to_string())?;

    match db_type {
        "ELASTICSEARCH" | "OPENSEARCH" | "EASYSEARCH" => Ok(normalize_es(connection)),
        "DYNAMODB" => normalize_dynamo(connection),
        "MONGODB" => Ok(normalize_mongo(connection)),
        other => Err(format!("Unknown connection type: {}", other)),
    }
}

fn normalize_es(conn: Value) -> Value {
    let mut config = serde_json::Map::new();
    if let Some(v) = conn.get("host").and_then(|v| v.as_str()) {
        let clean = v.trim_start_matches("http://").trim_start_matches("https://");
        config.insert("host".to_string(), Value::String(clean.to_string()));
    }
    if let Some(v) = conn.get("port") {
        config.insert("port".to_string(), v.clone());
    }
    if let Some(v) = conn.get("authType").and_then(|v| v.as_str()) {
        config.insert("authType".to_string(), Value::String(v.to_string()));
    }
    if let Some(v) = conn.get("username").and_then(|v| v.as_str()) {
        config.insert("username".to_string(), Value::String(v.to_string()));
    }
    if let Some(v) = conn.get("password").and_then(|v| v.as_str()) {
        config.insert("password".to_string(), Value::String(v.to_string()));
    }
    if let Some(v) = conn.get("apiKey").and_then(|v| v.as_str()) {
        config.insert("apiKey".to_string(), Value::String(v.to_string()));
    }
    if let Some(v) = conn.get("sslCertVerification") {
        config.insert("sslCertVerification".to_string(), v.clone());
    }
    if let Some(ssh) = conn.get("sshTunnel") {
        config.insert("sshTunnel".to_string(), ssh.clone());
    }
    Value::Object(config)
}

fn normalize_dynamo(conn: Value) -> Result<Value, String> {
    let mut config = serde_json::Map::new();

    if let Some(v) = conn.get("region").and_then(|v| v.as_str()) {
        config.insert("region".to_string(), Value::String(v.to_string()));
    }
    if let Some(v) = conn.get("endpointUrl").and_then(|v| v.as_str()) {
        if !v.is_empty() {
            config.insert("endpointUrl".to_string(), Value::String(v.to_string()));
        }
    }

    // DynamoDB auth is nested: { kind, accessKeyId, secretAccessKey, sessionToken, profileName }
    if let Some(auth) = conn.get("auth").and_then(|v| v.as_object()) {
        if let Some(kind) = auth.get("kind").and_then(|v| v.as_str()) {
            config.insert("authKind".to_string(), Value::String(kind.to_string()));
            match kind {
                "accessKey" | "sso" | "assumeRole" => {
                    if let Some(v) = auth.get("accessKeyId").and_then(|v| v.as_str()) {
                        config
                            .insert("accessKeyId".to_string(), Value::String(v.to_string()));
                    }
                    if let Some(v) = auth.get("secretAccessKey").and_then(|v| v.as_str()) {
                        config.insert(
                            "secretAccessKey".to_string(),
                            Value::String(v.to_string()),
                        );
                    }
                    if let Some(v) = auth.get("sessionToken").and_then(|v| v.as_str()) {
                        if !v.is_empty() {
                            config
                                .insert("sessionToken".to_string(), Value::String(v.to_string()));
                        }
                    }
                }
                "profile" => {
                    if let Some(v) = auth.get("profileName").and_then(|v| v.as_str()) {
                        config
                            .insert("profileName".to_string(), Value::String(v.to_string()));
                    }
                }
                _ => {}
            }
        }
    }

    if let Some(ssh) = conn.get("sshTunnel") {
        config.insert("sshTunnel".to_string(), ssh.clone());
    }

    Ok(Value::Object(config))
}

fn normalize_mongo(conn: Value) -> Value {
    let mut config = serde_json::Map::new();

    if let Some(v) = conn.get("host").and_then(|v| v.as_str()) {
        let clean = v.trim_start_matches("http://").trim_start_matches("https://");
        config.insert("host".to_string(), Value::String(clean.to_string()));
    }
    if let Some(v) = conn.get("port") {
        config.insert("port".to_string(), v.clone());
    }
    if let Some(v) = conn.get("tls") {
        config.insert("tls".to_string(), v.clone());
    }
    if let Some(v) = conn.get("database").and_then(|v| v.as_str()) {
        config.insert("database".to_string(), Value::String(v.to_string()));
    }

    // MongoDB auth is nested: { kind, username, password, authSource, authMechanism, uri }
    if let Some(auth) = conn.get("auth").and_then(|v| v.as_object()) {
        if let Some(kind) = auth.get("kind").and_then(|v| v.as_str()) {
            config.insert("authKind".to_string(), Value::String(kind.to_string()));
            match kind {
                "none" => {}
                "scram" => {
                    if let Some(v) = auth.get("username").and_then(|v| v.as_str()) {
                        config.insert("username".to_string(), Value::String(v.to_string()));
                    }
                    if let Some(v) = auth.get("password").and_then(|v| v.as_str()) {
                        config.insert("password".to_string(), Value::String(v.to_string()));
                    }
                    if let Some(v) = auth.get("authSource").and_then(|v| v.as_str()) {
                        config.insert("authSource".to_string(), Value::String(v.to_string()));
                    }
                    if let Some(v) = auth.get("authMechanism").and_then(|v| v.as_str()) {
                        config
                            .insert("authMechanism".to_string(), Value::String(v.to_string()));
                    }
                }
                "uri" => {
                    if let Some(v) = auth.get("uri").and_then(|v| v.as_str()) {
                        config.insert("uri".to_string(), Value::String(v.to_string()));
                    }
                }
                _ => {}
            }
        }
    }

    if let Some(ssh) = conn.get("sshTunnel") {
        config.insert("sshTunnel".to_string(), ssh.clone());
    }

    Value::Object(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_normalize_es_keeps_all_fields() {
        let conn = json!({
            "id": 1, "type": "ELASTICSEARCH", "host": "es.host", "port": 9200,
            "authType": "basic", "username": "u", "password": "p",
            "sslCertVerification": true,
        });
        let cfg = normalize_es(conn);
        assert_eq!(cfg.get("host").unwrap(), "es.host");
        assert_eq!(cfg.get("port").unwrap(), 9200);
        assert_eq!(cfg.get("authType").unwrap(), "basic");
        assert_eq!(cfg.get("username").unwrap(), "u");
        assert_eq!(cfg.get("password").unwrap(), "p");
        assert_eq!(cfg.get("sslCertVerification").unwrap(), true);
    }

    #[test]
    fn test_normalize_es_skips_missing_optionals() {
        let conn = json!({"id": 1, "type": "ELASTICSEARCH", "host": "h", "port": 9200});
        let cfg = normalize_es(conn);
        assert!(cfg.get("username").is_none());
    }

    #[test]
    fn test_normalize_es_strips_scheme_prefix() {
        let conn = json!({"id": 1, "type": "ELASTICSEARCH", "host": "http://es.host", "port": 9200});
        let cfg = normalize_es(conn);
        assert_eq!(cfg.get("host").unwrap(), "es.host");
    }

    #[test]
    fn test_normalize_es_strips_https_prefix() {
        let conn = json!({"id": 1, "type": "ELASTICSEARCH", "host": "https://es.host", "port": 9200});
        let cfg = normalize_es(conn);
        assert_eq!(cfg.get("host").unwrap(), "es.host");
    }

    #[test]
    fn test_normalize_es_keeps_host_without_prefix() {
        let conn = json!({"id": 1, "type": "ELASTICSEARCH", "host": "es.host", "port": 9200});
        let cfg = normalize_es(conn);
        assert_eq!(cfg.get("host").unwrap(), "es.host");
    }

    #[test]
    fn test_normalize_dynamo_access_key() {
        let conn = json!({
            "id": 1, "type": "DYNAMODB", "region": "us-west-2",
            "auth": {"kind": "accessKey", "accessKeyId": "AKID", "secretAccessKey": "SAK", "sessionToken": "ST"},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        assert_eq!(cfg.get("region").unwrap(), "us-west-2");
        assert_eq!(cfg.get("authKind").unwrap(), "accessKey");
        assert_eq!(cfg.get("accessKeyId").unwrap(), "AKID");
        assert_eq!(cfg.get("secretAccessKey").unwrap(), "SAK");
        assert_eq!(cfg.get("sessionToken").unwrap(), "ST");
    }

    #[test]
    fn test_normalize_dynamo_profile() {
        let conn = json!({
            "id": 1, "type": "DYNAMODB", "region": "us-east-1",
            "auth": {"kind": "profile", "profileName": "my-profile"},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        assert_eq!(cfg.get("authKind").unwrap(), "profile");
        assert_eq!(cfg.get("profileName").unwrap(), "my-profile");
    }

    #[test]
    fn test_normalize_dynamo_skips_empty_session_token() {
        let conn = json!({
            "id": 1, "type": "DYNAMODB", "region": "us-east-1",
            "auth": {"kind": "accessKey", "accessKeyId": "AKID", "secretAccessKey": "SAK", "sessionToken": ""},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        assert!(cfg.get("sessionToken").is_none(), "empty sessionToken should be omitted");
    }

    #[test]
    fn test_normalize_dynamo_endpoint_url() {
        let conn = json!({
            "id": 1, "type": "DYNAMODB", "region": "us-east-1", "endpointUrl": "http://localhost:8000",
            "auth": {"kind": "accessKey", "accessKeyId": "AKID", "secretAccessKey": "SAK"},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        assert_eq!(cfg.get("endpointUrl").unwrap(), "http://localhost:8000");
    }

    #[test]
    fn test_normalize_dynamo_missing_endpoint() {
        let conn = json!({
            "id": 1, "type": "DYNAMODB", "region": "us-east-1",
            "auth": {"kind": "accessKey", "accessKeyId": "AKID", "secretAccessKey": "SAK"},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        assert!(cfg.get("endpointUrl").is_none());
    }

    #[test]
    fn test_normalize_mongo_scram() {
        let conn = json!({
            "id": 1, "type": "MONGODB", "host": "mongo.host", "port": 27017, "tls": true, "database": "testdb",
            "auth": {"kind": "scram", "username": "admin", "password": "pass", "authSource": "admin", "authMechanism": "SCRAM-SHA-256"},
        });
        let cfg = normalize_mongo(conn);
        assert_eq!(cfg.get("host").unwrap(), "mongo.host");
        assert_eq!(cfg.get("port").unwrap(), 27017);
        assert_eq!(cfg.get("tls").unwrap(), true);
        assert_eq!(cfg.get("database").unwrap(), "testdb");
        assert_eq!(cfg.get("authKind").unwrap(), "scram");
        assert_eq!(cfg.get("authMechanism").unwrap(), "SCRAM-SHA-256");
    }

    #[test]
    fn test_normalize_mongo_uri_auth() {
        let conn = json!({
            "id": 1, "type": "MONGODB",
            "auth": {"kind": "uri", "uri": "mongodb+srv://cluster.mongodb.net"},
        });
        let cfg = normalize_mongo(conn);
        assert_eq!(cfg.get("authKind").unwrap(), "uri");
    }

    #[test]
    fn test_normalize_es_passes_ssh_tunnel() {
        let conn = json!({
            "host": "es.host", "port": 9200,
            "sshTunnel": {"enabled": true, "profileIds": ["p1"]},
        });
        let cfg = normalize_es(conn);
        let tunnel = cfg.get("sshTunnel").unwrap();
        assert_eq!(tunnel["enabled"], true);
        assert_eq!(tunnel["profileIds"][0], "p1");
    }

    #[test]
    fn test_normalize_dynamo_passes_ssh_tunnel() {
        let conn = json!({
            "region": "us-east-1",
            "auth": {"kind": "accessKey", "accessKeyId": "AKID", "secretAccessKey": "SAK"},
            "sshTunnel": {"enabled": false},
        });
        let cfg = normalize_dynamo(conn).unwrap();
        let tunnel = cfg.get("sshTunnel").unwrap();
        assert_eq!(tunnel["enabled"], false);
    }

    #[test]
    fn test_normalize_mongo_passes_ssh_tunnel() {
        let conn = json!({
            "host": "mongo.host", "port": 27017,
            "auth": {"kind": "none"},
            "sshTunnel": {"enabled": true, "profileIds": ["p1", "p2"]},
        });
        let cfg = normalize_mongo(conn);
        let tunnel = cfg.get("sshTunnel").unwrap();
        assert_eq!(tunnel["enabled"], true);
        assert_eq!(tunnel["profileIds"][0], "p1");
        assert_eq!(tunnel["profileIds"][1], "p2");
    }

    #[test]
    fn test_normalize_config_unknown_type() {
        let err = normalize_config(json!({"id": 1, "type": "UNKNOWN"})).unwrap_err();
        assert!(err.contains("Unknown connection type"), "got: {}", err);
    }

    #[test]
    fn test_normalize_config_missing_type() {
        let err = normalize_config(json!({"id": 1})).unwrap_err();
        assert!(err.contains("type"), "got: {}", err);
    }
}
