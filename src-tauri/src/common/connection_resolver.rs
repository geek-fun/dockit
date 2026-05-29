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
        config.insert("host".to_string(), Value::String(v.to_string()));
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

    Ok(Value::Object(config))
}

fn normalize_mongo(conn: Value) -> Value {
    let mut config = serde_json::Map::new();

    if let Some(v) = conn.get("host").and_then(|v| v.as_str()) {
        config.insert("host".to_string(), Value::String(v.to_string()));
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

    Value::Object(config)
}
