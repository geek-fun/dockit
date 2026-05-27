use async_trait::async_trait;
use base64::Engine;
use futures::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::{options::ClientOptions, Client as MongoClient};
use serde_json::{json, Value};
use url::form_urlencoded;

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
    form_urlencoded::byte_serialize(segment.as_bytes()).collect()
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
use crate::dynamo::list_tables::list_tables;

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
    let client = create_http_client("system", None, Some(ssl), None);

    let (method, path, body) = match tool_name {
        "es__search" => {
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
        "es__get_document" => {
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
        "es__index_document" => {
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
        "es__update_document" => {
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
        "es__delete_document" => {
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
        "es__delete_by_query" => {
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
        "es__cat_indices" => ("GET", "/_cat/indices?format=json".to_string(), None),
        "es__get_mapping" => {
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
        "es__create_index" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let body = args.get("body").map(|b| b.to_string());
            ("PUT", format!("/{}", url_encode_segment(index)), body)
        }
        "es__delete_index" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            ("DELETE", format!("/{}", url_encode_segment(index)), None)
        }
        "es__put_mapping" => {
            let index = args
                .get("index")
                .and_then(|v| v.as_str())
                .ok_or("Missing index")?;
            validate_index_name(index, false)?;
            let body = args.get("body").ok_or("Missing body")?.to_string();
            (
                "PUT",
                format!("/{}/_mapping", url_encode_segment(index)),
                Some(body),
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

async fn execute_dynamo_tool(
    tool_name: &str,
    args: &Value,
    config: &Value,
) -> Result<String, String> {
    let client = create_dynamo_client(config).await?;

    match tool_name {
        "dynamo__execute_query" | "dynamo__execute_write" | "dynamo__execute_delete" => {
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
        "dynamo__describe_table" => {
            let table_name = args
                .get("table_name")
                .and_then(|v| v.as_str())
                .ok_or("Missing table_name")?;
            let response = describe_table(&client, table_name).await?;
            serde_json::to_string(&response)
                .map(truncate_tool_output)
                .map_err(|e| e.to_string())
        }
        "dynamo__list_tables" => {
            let response = list_tables(&client).await?;
            serde_json::to_string(&response)
                .map(truncate_tool_output)
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown DynamoDB tool: {}", tool_name)),
    }
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

fn bson_to_value(bson: &Bson) -> Value {
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

fn json_to_bson_doc_agent(val: &Value) -> Result<Document, String> {
    mongodb::bson::to_document(val)
        .map_err(|e| format!("Failed to convert to BSON document: {}", e))
}

async fn execute_mongo_tool(
    tool_name: &str,
    args: &Value,
    config: &Value,
) -> Result<String, String> {
    let (client, config_db_name) = create_mongo_client_from_config(config).await?;

    // list_databases is the only tool that does not require a target database.
    if tool_name == "mongo__list_databases" {
        let names = client
            .list_database_names()
            .await
            .map_err(|e| format!("Failed to list databases: {}", e))?;
        let result = json!({ "databases": names });
        return Ok(truncate_tool_output(result.to_string()));
    }

    let db_name = args
        .get("database")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&config_db_name)
        .to_string();
    if db_name.is_empty() {
        return Err("No database specified. Pass a \"database\" argument or set a default database in the connection settings.".to_string());
    }

    match tool_name {
        "mongo__list_collections" => {
            let db = client.database(&db_name);
            let names = db
                .list_collection_names()
                .await
                .map_err(|e| format!("Failed to list collections: {}", e))?;
            let result = json!({ "collections": names });
            Ok(truncate_tool_output(result.to_string()))
        }
        "mongo__find" => {
            let collection_name = args
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or("Missing collection")?;
            let filter_val = args.get("filter").cloned().unwrap_or(json!({}));
            let filter = json_to_bson_doc_agent(&filter_val)?;
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(20)
                .max(1)
                .min(100) as i64;

            let db = client.database(&db_name);
            let coll = db.collection::<Document>(collection_name);

            let mut find_options = mongodb::options::FindOptions::default();
            find_options.limit = Some(limit);
            if let Some(sort_val) = args.get("sort") {
                find_options.sort = Some(json_to_bson_doc_agent(sort_val)?);
            }
            if let Some(proj_val) = args.get("projection") {
                find_options.projection = Some(json_to_bson_doc_agent(proj_val)?);
            }

            let mut cursor = coll
                .find(filter)
                .with_options(find_options)
                .await
                .map_err(|e| format!("find failed: {}", e))?;
            let mut docs: Vec<Value> = Vec::new();
            while let Some(doc) = cursor
                .try_next()
                .await
                .map_err(|e| format!("cursor error: {}", e))?
            {
                docs.push(bson_to_value(&Bson::Document(doc)));
            }
            let result = json!({ "count": docs.len(), "documents": docs });
            Ok(truncate_tool_output(result.to_string()))
        }
        "mongo__aggregate" => {
            let collection_name = args
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or("Missing collection")?;
            let pipeline_val = args
                .get("pipeline")
                .and_then(|v| v.as_array())
                .ok_or("Missing or invalid pipeline")?;
            let pipeline: Vec<Document> = pipeline_val
                .iter()
                .map(json_to_bson_doc_agent)
                .collect::<Result<Vec<_>, _>>()?;

            let db = client.database(&db_name);
            let coll = db.collection::<Document>(collection_name);
            let mut cursor = coll
                .aggregate(pipeline)
                .await
                .map_err(|e| format!("aggregate failed: {}", e))?;
            let mut docs: Vec<Value> = Vec::new();
            while let Some(doc) = cursor
                .try_next()
                .await
                .map_err(|e| format!("cursor error: {}", e))?
            {
                docs.push(bson_to_value(&Bson::Document(doc)));
                if docs.len() >= 100 {
                    break;
                }
            }
            let result = json!({ "count": docs.len(), "documents": docs });
            Ok(truncate_tool_output(result.to_string()))
        }
        "mongo__insert_one" => {
            let collection_name = args
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or("Missing collection")?;
            let document_val = args.get("document").ok_or("Missing document")?;
            let document = json_to_bson_doc_agent(document_val)?;

            let db = client.database(&db_name);
            let coll = db.collection::<Document>(collection_name);
            let insert_result = coll
                .insert_one(document)
                .await
                .map_err(|e| format!("insert_one failed: {}", e))?;
            let inserted_id = bson_to_value(&insert_result.inserted_id);
            let result = json!({ "inserted_id": inserted_id });
            Ok(truncate_tool_output(result.to_string()))
        }
        "mongo__update_many" => {
            let collection_name = args
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or("Missing collection")?;
            let filter_val = args.get("filter").ok_or("Missing filter")?;
            let update_val = args.get("update").ok_or("Missing update")?;
            let filter = json_to_bson_doc_agent(filter_val)?;
            let update = json_to_bson_doc_agent(update_val)?;
            let upsert = args
                .get("upsert")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let db = client.database(&db_name);
            let coll = db.collection::<Document>(collection_name);
            let update_options = mongodb::options::UpdateOptions::builder()
                .upsert(upsert)
                .build();
            let update_result = coll
                .update_many(filter, update)
                .with_options(update_options)
                .await
                .map_err(|e| format!("update_many failed: {}", e))?;
            let result = json!({
                "matched_count": update_result.matched_count,
                "modified_count": update_result.modified_count,
                "upserted_id": update_result.upserted_id.map(|id| bson_to_value(&id))
            });
            Ok(truncate_tool_output(result.to_string()))
        }
        "mongo__delete_many" => {
            let collection_name = args
                .get("collection")
                .and_then(|v| v.as_str())
                .ok_or("Missing collection")?;
            let filter_val = args.get("filter").ok_or("Missing filter")?;
            let filter = json_to_bson_doc_agent(filter_val)?;

            let db = client.database(&db_name);
            let coll = db.collection::<Document>(collection_name);
            let delete_result = coll
                .delete_many(filter)
                .await
                .map_err(|e| format!("delete_many failed: {}", e))?;
            let result = json!({ "deleted_count": delete_result.deleted_count });
            Ok(truncate_tool_output(result.to_string()))
        }
        _ => Err(format!("Unknown MongoDB tool: {}", tool_name)),
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

    if tool_name.starts_with("es__") {
        execute_es_tool(&tool_name, &args, &connection_config).await
    } else if tool_name.starts_with("dynamo__") {
        execute_dynamo_tool(&tool_name, &args, &connection_config).await
    } else if tool_name.starts_with("mongo__") {
        execute_mongo_tool(&tool_name, &args, &connection_config).await
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

        let raw = if tool_name.starts_with("es__") {
            execute_es_tool(tool_name, arguments, connection_config).await?
        } else if tool_name.starts_with("dynamo__") {
            execute_dynamo_tool(tool_name, arguments, connection_config).await?
        } else if tool_name.starts_with("mongo__") {
            execute_mongo_tool(tool_name, arguments, connection_config).await?
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
