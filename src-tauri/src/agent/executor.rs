use async_trait::async_trait;
use base64::Engine;
use mongodb::bson::{Bson, Document};
use mongodb::{options::ClientOptions, Client as MongoClient};
use serde_json::{json, Value};
use url::form_urlencoded;

const TOOL_OUTPUT_MAX_BYTES: usize = 32 * 1024; // 32 KB

pub(crate) fn validate_index_name(name: &str, allow_wildcard: bool) -> Result<(), String> {
    if name.is_empty() {
        return Err("Index name must not be empty".to_string());
    }
    if name.len() > 255 {
        return Err("Index name exceeds 255 characters".to_string());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(format!("Index name contains invalid characters: {}", name));
    }
    let valid = name.chars().all(|c| {
        c.is_ascii_lowercase()
            || c.is_ascii_digit()
            || c == '-'
            || c == '_'
            || c == '.'
            || (c == '*' && allow_wildcard)
    });
    if !valid {
        return Err(format!("Index name contains invalid characters: {}", name));
    }
    Ok(())
}

pub(crate) fn url_encode_segment(segment: &str) -> String {
    form_urlencoded::byte_serialize(segment.as_bytes()).collect()
}

pub(crate) fn truncate_tool_output(output: String) -> String {
    if output.len() <= TOOL_OUTPUT_MAX_BYTES {
        return output;
    }
    // Find the nearest char boundary at or before the byte limit to avoid splitting a UTF-8 codepoint.
    let boundary = (0..=TOOL_OUTPUT_MAX_BYTES)
        .rev()
        .find(|&i| output.is_char_boundary(i))
        .unwrap_or(0);
    let omitted = output.len() - boundary;
    format!(
        "{}\n\n[Output truncated: {} bytes omitted. Consider refining your query to return fewer results.]",
        &output[..boundary], omitted
    )
}
use aws_config::meta::region::RegionProviderChain;
use aws_config::profile::ProfileFileCredentialsProvider;
use aws_config::Region;
use aws_sdk_dynamodb::{config::Credentials, Client as DynamoClient};

pub(crate) fn build_es_base_url(config: &Value) -> Result<String, String> {
    let host = config
        .get("host")
        .and_then(|v| v.as_str())
        .ok_or("Missing host in connection config")?;
    let port = config
        .get("port")
        .and_then(|v| v.as_u64())
        .ok_or("Missing port in connection config")?;
    Ok(format!("{}:{}", host, port))
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

pub(crate) async fn create_dynamo_client(config: &Value) -> Result<DynamoClient, String> {
    let region = config
        .get("region")
        .and_then(|v| v.as_str())
        .ok_or("Missing region")?;
    let endpoint_url = config.get("endpointUrl").and_then(|v| v.as_str());

    let region_provider = RegionProviderChain::first_try(Region::new(region.to_string()))
        .or_default_provider()
        .or_else("us-east-1");

    let mut config_builder =
        aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);

    // Handle different auth types
    if let Some(auth_kind) = config.get("authKind").and_then(|v| v.as_str()) {
        match auth_kind {
            "accessKey" | "sso" | "assumeRole" => {
                let access_key_id = config
                    .get("accessKeyId")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing accessKeyId")?;
                let secret_access_key = config
                    .get("secretAccessKey")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing secretAccessKey")?;
                let session_token = config
                    .get("sessionToken")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let creds = Credentials::new(
                    access_key_id,
                    secret_access_key,
                    session_token,
                    None,
                    "dockit-agent",
                );
                config_builder = config_builder.credentials_provider(creds);
            }
            "profile" => {
                let profile_name = config
                    .get("profileName")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing profileName")?;
                let profile_provider = ProfileFileCredentialsProvider::builder()
                    .profile_name(profile_name)
                    .build();
                config_builder = config_builder.credentials_provider(profile_provider);
            }
            _ => {
                return Err(format!("Unsupported auth kind: {}", auth_kind));
            }
        }
    } else {
        // Fallback to direct credentials for backward compatibility
        let access_key_id = config
            .get("accessKeyId")
            .and_then(|v| v.as_str())
            .ok_or("Missing accessKeyId")?;
        let secret_access_key = config
            .get("secretAccessKey")
            .and_then(|v| v.as_str())
            .ok_or("Missing secretAccessKey")?;

        let creds = Credentials::new(access_key_id, secret_access_key, None, None, "dockit-agent");
        config_builder = config_builder.credentials_provider(creds);
    }

    if let Some(endpoint) = endpoint_url {
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }
    }

    let aws_config = config_builder.load().await;
    Ok(DynamoClient::new(&aws_config))
}

fn strip_sql_comments(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            while let Some(cc) = chars.next() {
                if cc == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    break;
                }
            }
        } else if c == '-' && chars.peek() == Some(&'-') {
            while let Some(cc) = chars.next() {
                if cc == '\n' {
                    break;
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

pub(crate) fn validate_dynamo_statement(tool_name: &str, statement: &str) -> Result<(), String> {
    let cleaned = strip_sql_comments(statement);
    let upper = cleaned.trim().to_uppercase();
    let first_word = upper.split_whitespace().next().unwrap_or("");

    match tool_name {
        "dynamo__execute_query" => {
            if matches!(
                first_word,
                "INSERT" | "UPDATE" | "DELETE" | "DROP" | "CREATE" | "ALTER" | "TRUNCATE"
            ) {
                return Err(format!(
                    "dynamo__execute_query is read-only; rejected statement starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo__execute_write" => {
            if matches!(first_word, "DELETE" | "DROP" | "TRUNCATE") {
                return Err(format!(
                    "dynamo__execute_write does not allow destructive statements starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo__execute_delete" => {
            if first_word != "DELETE" {
                return Err(format!(
                    "dynamo__execute_delete only allows DELETE statements, got '{}'",
                    first_word
                ));
            }
        }
        _ => {}
    }
    Ok(())
}

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
            url_encode_segment(username), url_encode_segment(password), host, port, db_path, query
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

pub(crate) fn bson_to_value(bson: &Bson) -> Value {
    match bson {
        Bson::Double(v) => json!(*v),
        Bson::String(v) => json!(v),
        Bson::Array(arr) => Value::Array(arr.iter().map(bson_to_value).collect()),
        Bson::Document(d) => {
            let map: serde_json::Map<String, Value> =
                d.iter().map(|(k, v)| (k.clone(), bson_to_value(v))).collect();
            Value::Object(map)
        }
        Bson::Boolean(v) => json!(*v),
        Bson::Null => Value::Null,
        Bson::Int32(v) => json!(*v),
        Bson::Int64(v) => json!(*v),
        Bson::ObjectId(oid) => json!(oid.to_string()),
        Bson::DateTime(dt) => json!(dt.timestamp_millis()),
        other => json!(other.to_string()),
    }
}

pub(crate) fn json_to_bson_doc_agent(val: &Value) -> Result<Document, String> {
    mongodb::bson::to_document(val)
        .map_err(|e| format!("Failed to convert to BSON document: {}", e))
}

const TOOL_ENVELOPE_MAX_CHARS: usize = 32768;
const TOOL_ENVELOPE_SUMMARY_CHARS: usize = 1024;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolResultMetadata {
    pub tool_name: String,
    pub duration_ms: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolEnvelope {
    pub summary: String,
    pub full_result: String,
    pub metadata: ToolResultMetadata,
}

fn char_truncate(input: &str, max_chars: usize) -> (String, bool) {
    if input.chars().count() <= max_chars {
        return (input.to_string(), false);
    }
    let truncated: String = input.chars().take(max_chars).collect();
    (truncated, true)
}

pub struct DocKitToolExecutor;

#[async_trait]
impl crate::agent::tool_executor::ToolExecutor for DocKitToolExecutor {
    async fn execute(
        &self,
        tool_name: &str,
        arguments: &Value,
        connection_config: &Value,
    ) -> Result<ToolEnvelope, String> {
        let start = std::time::Instant::now();

        let conn_opt = if connection_config.is_null() {
            None
        } else {
            Some(connection_config.clone())
        };

        let raw = crate::capabilities::registry::invoke_capability_inner(
            tool_name,
            arguments.clone(),
            conn_opt,
        )
        .await?;

        let duration_ms = start.elapsed().as_millis() as u64;
        let (full_result, truncated) = char_truncate(&raw, TOOL_ENVELOPE_MAX_CHARS);
        let (summary, _) = char_truncate(&full_result, TOOL_ENVELOPE_SUMMARY_CHARS);

        Ok(ToolEnvelope {
            summary,
            full_result,
            metadata: ToolResultMetadata {
                tool_name: tool_name.to_string(),
                duration_ms,
                truncated,
            },
        })
    }
}
