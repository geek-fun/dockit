use async_trait::async_trait;
use base64::Engine;
use serde_json::{json, Value};

use crate::common::http_client::create_http_client;

const TOOL_OUTPUT_MAX_BYTES: usize = 8 * 1024; // 8 KB

fn truncate_tool_output(output: String) -> String {
    if output.len() <= TOOL_OUTPUT_MAX_BYTES {
        return output;
    }
    let truncated = &output[..TOOL_OUTPUT_MAX_BYTES];
    let omitted = output.len() - TOOL_OUTPUT_MAX_BYTES;
    format!(
        "{}\n\n[Output truncated: {} bytes omitted. Consider refining your query to return fewer results.]",
        truncated, omitted
    )
}
use crate::dynamo::describe_table::describe_table;
use crate::dynamo::execute_statement::{execute_statement, ExecuteStatementInput};

use aws_config::meta::region::RegionProviderChain;
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
    let access_key_id = config
        .get("accessKeyId")
        .and_then(|v| v.as_str())
        .ok_or("Missing accessKeyId")?;
    let secret_access_key = config
        .get("secretAccessKey")
        .and_then(|v| v.as_str())
        .ok_or("Missing secretAccessKey")?;
    let endpoint_url = config.get("endpointUrl").and_then(|v| v.as_str());

    let region_provider = RegionProviderChain::first_try(Region::new(region.to_string()))
        .or_default_provider()
        .or_else("us-east-1");

    let creds = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "dockit-agent",
    );

    let mut config_builder = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider)
        .credentials_provider(creds);

    if let Some(endpoint) = endpoint_url {
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }
    }

    let aws_config = config_builder.load().await;
    Ok(DynamoClient::new(&aws_config))
}

async fn execute_es_tool(
    tool_name: &str,
    args: &Value,
    config: &Value,
) -> Result<String, String> {
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
            let body = args.get("body").ok_or("Missing body")?;
            ("POST", format!("/{}/_search", index), Some(body.to_string()))
        }
        "es.get_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            ("GET", format!("/{}/_doc/{}", index, id), None)
        }
        "es.index_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            let body = args.get("body").ok_or("Missing body")?;
            let path = match args.get("id").and_then(|v| v.as_str()) {
                Some(id) => format!("/{}/_doc/{}", index, id),
                None => format!("/{}/_doc", index),
            };
            ("POST", path, Some(body.to_string()))
        }
        "es.update_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            let body = args.get("body").ok_or("Missing body")?;
            (
                "POST",
                format!("/{}/_update/{}", index, id),
                Some(body.to_string()),
            )
        }
        "es.delete_document" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("Missing id")?;
            ("DELETE", format!("/{}/_doc/{}", index, id), None)
        }
        "es.delete_by_query" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            let body = args.get("body").ok_or("Missing body")?;
            (
                "POST",
                format!("/{}/_delete_by_query", index),
                Some(body.to_string()),
            )
        }
        "es.cat_indices" => ("GET", "/_cat/indices?format=json".to_string(), None),
        "es.get_mapping" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            ("GET", format!("/{}/_mapping", index), None)
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
pub async fn execute_tool(
    tool_name: String,
    arguments: String,
    connection_config: serde_json::Value,
) -> Result<String, String> {
    let args: Value =
        serde_json::from_str(&arguments).map_err(|e| format!("Failed to parse arguments: {}", e))?;

    if tool_name.starts_with("es.") {
        execute_es_tool(&tool_name, &args, &connection_config).await
    } else if tool_name.starts_with("dynamo.") {
        execute_dynamo_tool(&tool_name, &args, &connection_config).await
    } else {
        Err(format!("Unknown tool: {}", tool_name))
    }
}

const TOOL_ENVELOPE_MAX_CHARS: usize = 8192;
const TOOL_ENVELOPE_SUMMARY_CHARS: usize = 400;

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
