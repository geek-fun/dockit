use async_trait::async_trait;
use base64::Engine;
use serde_json::{json, Value};

use crate::common::http_client::create_http_client;

const TOOL_OUTPUT_MAX_BYTES: usize = 32 * 1024; // 32 KB

fn validate_index_name(name: &str, allow_wildcard: bool) -> Result<(), String> {
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

fn url_encode_segment(segment: &str) -> String {
    segment
        .bytes()
        .flat_map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => vec![b as char]
                .into_iter()
                .map(|c| c.to_string())
                .collect::<Vec<_>>(),
            _ => vec![format!("%{:02X}", b)],
        })
        .collect()
}

fn truncate_tool_output(output: String) -> String {
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
use crate::dynamo::describe_table::describe_table;
use crate::dynamo::execute_statement::{execute_statement, ExecuteStatementInput};

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

async fn execute_es_tool(tool_name: &str, args: &Value, config: &Value) -> Result<String, String> {
    let base_url = build_es_base_url(config)?;
    let headers = build_es_headers(config);
    let ssl = get_es_ssl_flag(config);
    let client = create_http_client(None, Some(ssl));

    let (method, path, body) = match tool_name {
        "es.search" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, true)?;
            let body = args.get("body").ok_or("Missing body")?;
            (
                "POST",
                format!("/{}/_search", url_encode_segment(index)),
                Some(body.to_string()),
            )
        }
        "es.get_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, true)?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            (
                "GET",
                format!(
                    "/{}/_doc/{}",
                    url_encode_segment(index),
                    url_encode_segment(id)
                ),
                None,
            )
        }
        "es.index_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let body = args.get("body").ok_or("Missing body")?;
            let path = match args.get("id").and_then(|v| v.as_str()) {
                Some(id) => format!(
                    "/{}/_doc/{}",
                    url_encode_segment(index),
                    url_encode_segment(id)
                ),
                None => format!("/{}/_doc", url_encode_segment(index)),
            };
            ("POST", path, Some(body.to_string()))
        }
        "es.update_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            let body = args.get("body").ok_or("Missing body")?;
            (
                "POST",
                format!(
                    "/{}/_update/{}",
                    url_encode_segment(index),
                    url_encode_segment(id)
                ),
                Some(body.to_string()),
            )
        }
        "es.delete_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            (
                "DELETE",
                format!(
                    "/{}/_doc/{}",
                    url_encode_segment(index),
                    url_encode_segment(id)
                ),
                None,
            )
        }
        "es.delete_by_query" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let body = args.get("body").ok_or("Missing body")?;
            (
                "POST",
                format!("/{}/_delete_by_query", url_encode_segment(index)),
                Some(body.to_string()),
            )
        }
        "es.cat_indices" => ("GET", "/_cat/indices?format=json".to_string(), None),
        "es.get_mapping" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, true)?;
            (
                "GET",
                format!("/{}/_mapping", url_encode_segment(index)),
                None,
            )
        }
        _ => return Err(format!("Unknown ES tool: {}", tool_name)),
    };

    let url = format!("{}{}", base_url, path);
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| format!("Bad method: {}", e))?;

    let mut request = client.request(method, &url).headers(headers);
    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("ES request failed: {}", e))?;
    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read ES response: {}", e))?;

    let result = json!({
        "status": status,
        "data": serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body))
    });

    Ok(truncate_tool_output(result.to_string()))
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

fn validate_dynamo_statement(tool_name: &str, statement: &str) -> Result<(), String> {
    let cleaned = strip_sql_comments(statement);
    let upper = cleaned.trim().to_uppercase();
    let first_word = upper.split_whitespace().next().unwrap_or("");

    match tool_name {
        "dynamo.execute_query" => {
            if matches!(
                first_word,
                "INSERT" | "UPDATE" | "DELETE" | "DROP" | "CREATE" | "ALTER" | "TRUNCATE"
            ) {
                return Err(format!(
                    "dynamo.execute_query is read-only; rejected statement starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo.execute_write" => {
            if matches!(first_word, "DELETE" | "DROP" | "TRUNCATE") {
                return Err(format!(
                    "dynamo.execute_write does not allow destructive statements starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo.execute_delete" => {
            if first_word != "DELETE" {
                return Err(format!(
                    "dynamo.execute_delete only allows DELETE statements, got '{}'",
                    first_word
                ));
            }
        }
        _ => {}
    }
    Ok(())
}

async fn execute_dynamo_tool(
    tool_name: &str,
    args: &Value,
    config: &Value,
) -> Result<String, String> {
    let client = create_dynamo_client(config).await?;

    match tool_name {
        "dynamo.execute_query" | "dynamo.execute_write" | "dynamo.execute_delete" => {
            let statement = args
                .get("statement")
                .and_then(|v| v.as_str())
                .ok_or("Missing statement")?;
            validate_dynamo_statement(tool_name, statement)?;
            let input = ExecuteStatementInput {
                statement,
                next_token: None,
                limit: None,
            };
            let response = execute_statement(&client, input).await?;
            serde_json::to_string(&response)
                .map(truncate_tool_output)
                .map_err(|e| e.to_string())
        }
        "dynamo.describe_table" => {
            let table_name = args
                .get("table_name")
                .and_then(|v| v.as_str())
                .ok_or("Missing table_name")?;
            let response = describe_table(&client, table_name).await?;
            serde_json::to_string(&response)
                .map(truncate_tool_output)
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown DynamoDB tool: {}", tool_name)),
    }
}

#[tauri::command]
#[allow(dead_code)]
pub async fn execute_tool(
    tool_name: String,
    arguments: String,
    connection_config: serde_json::Value,
) -> Result<String, String> {
    // Security note: Not registered in the Tauri invoke_handler.
    // Tool execution is gated by the agent loop, which enforces per-session
    // tool allow-lists and user confirmation. This helper remains only for
    // potential internal callers; it is not reachable from the webview.
    let args: Value = serde_json::from_str(&arguments)
        .map_err(|e| format!("Failed to parse arguments: {}", e))?;

    if tool_name.starts_with("es.") {
        execute_es_tool(&tool_name, &args, &connection_config).await
    } else if tool_name.starts_with("dynamo.") {
        execute_dynamo_tool(&tool_name, &args, &connection_config).await
    } else {
        Err(format!("Unknown tool: {}", tool_name))
    }
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

        let raw = if tool_name.starts_with("es.") {
            execute_es_tool(tool_name, arguments, connection_config).await?
        } else if tool_name.starts_with("dynamo.") {
            execute_dynamo_tool(tool_name, arguments, connection_config).await?
        } else {
            return Err(format!("Unknown tool: {}", tool_name));
        };

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
