use std::sync::Arc;

use serde_json::Value;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// ES capability handlers
// ---------------------------------------------------------------------------

/// Helper: execute an ES HTTP request with common setup
pub(crate) async fn execute_es_http(
    method: &str,
    path: &str,
    body: Option<&str>,
    config: &Value,
) -> Result<String, String> {
    let base_url = crate::common::es::build_es_base_url(config)?;
    let headers = crate::common::es::build_es_headers(config);
    let ssl = crate::common::es::get_es_ssl_flag(config);
    let client = crate::common::http_client::create_http_client("system", None, Some(ssl), None);

    let url = format!("{}{}", base_url, path);
    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|e| format!("Bad method: {}", e))?;

    let mut request = client.request(method, &url).headers(headers);
    if let Some(body) = body {
        request = request.body(body.to_string());
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

    let data = serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body));
    let message = if status >= 400 {
        data.get("error")
            .and_then(|e| e.get("reason"))
            .and_then(|r| r.as_str())
            .or_else(|| data.as_str())
            .unwrap_or("Request failed")
            .to_string()
    } else {
        String::new()
    };

    let mut result = serde_json::json!({
        "status": status,
        "data": data,
    });
    if !message.is_empty() {
        result["message"] = serde_json::json!(message);
    }

    Ok(crate::common::format::truncate_tool_output(result.to_string()))
}

pub(crate) struct EsSearch;
pub(crate) struct EsGetDocument;
pub(crate) struct EsIndexDocument;
pub(crate) struct EsUpdateDocument;
pub(crate) struct EsDeleteDocument;
pub(crate) struct EsDeleteByQuery;
pub(crate) struct EsCatIndices;
pub(crate) struct EsGetMapping;
pub(crate) struct EsCreateIndex;
pub(crate) struct EsDeleteIndex;
pub(crate) struct EsPutMapping;
pub(crate) struct EsCatAliases;
pub(crate) struct EsGetAlias;
pub(crate) struct EsPutAlias;
pub(crate) struct EsDeleteAlias;
pub(crate) struct EsUpdateAliases;

macro_rules! impl_es_handler {
    ($struct:ty, $method:expr, $path_fn:expr, $has_body:expr) => {
        #[async_trait::async_trait]
        impl CapabilityHandler for $struct {
            async fn handle(
                &self,
                args: &Value,
                connection_config: Option<&Value>,
            ) -> Result<String, String> {
                let config = connection_config.ok_or_else(|| "ES requires a connection config".to_string())?;
                let path_builder = $path_fn;
                let path = path_builder(args)?;
                let body = if $has_body {
                    args.get("body").map(|b| b.to_string())
                } else {
                    None
                };
                execute_es_http($method, &path, body.as_deref(), config).await
            }
        }
    };
}

// ---- Handlers ----

impl_es_handler!(EsSearch, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, true)?;
    Ok(format!("/{}/_search", crate::common::validation::url_encode_segment(index)))
}, true);

impl_es_handler!(EsGetDocument, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, true)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_doc/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(id)))
}, false);

impl_es_handler!(EsIndexDocument, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    match args.get("id").and_then(|v| v.as_str()) {
        Some(id) => Ok(format!("/{}/_doc/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(id))),
        None => Ok(format!("/{}/_doc", crate::common::validation::url_encode_segment(index))),
    }
}, true);

impl_es_handler!(EsUpdateDocument, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_update/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(id)))
}, true);

impl_es_handler!(EsDeleteDocument, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_doc/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(id)))
}, false);

impl_es_handler!(EsDeleteByQuery, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    Ok(format!("/{}/_delete_by_query", crate::common::validation::url_encode_segment(index)))
}, true);

#[async_trait::async_trait]
impl CapabilityHandler for EsCatIndices {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "ES requires a connection config".to_string())?;
        let include_system = args
            .get("include_system")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Only request system indices from ES when explicitly needed — this keeps the
        // response smaller (avoiding truncation of user indices) and avoids pulling
        // system data unnecessarily.
        let query = if include_system {
            "/_cat/indices?format=json&expand_wildcards=all"
        } else {
            "/_cat/indices?format=json"
        };

        let raw = execute_es_http("GET", query, None, config).await?;
        let parsed: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse cat_indices response: {}", e))?;

        let Some(arr) = parsed.as_array() else {
            return Ok(raw);
        };

        let mut user: Vec<&serde_json::Value> = Vec::new();
        let mut system: Vec<&serde_json::Value> = Vec::new();

        for index in arr {
            let name = index.get("index").and_then(|v| v.as_str()).unwrap_or("");
            if name.starts_with('.') || name.starts_with("_") {
                system.push(index);
            } else {
                user.push(index);
            }
        }

        // Sort each group alphabetically by index name for predictable ordering
        user.sort_by(|a, b| {
            let an = a.get("index").and_then(|v| v.as_str()).unwrap_or("");
            let bn = b.get("index").and_then(|v| v.as_str()).unwrap_or("");
            an.cmp(bn)
        });
        system.sort_by(|a, b| {
            let an = a.get("index").and_then(|v| v.as_str()).unwrap_or("");
            let bn = b.get("index").and_then(|v| v.as_str()).unwrap_or("");
            an.cmp(bn)
        });

        let sorted: Vec<&serde_json::Value> = if include_system {
            let mut result = user;
            result.extend(system);
            result
        } else {
            user
        };

        let result = serde_json::to_string(&sorted)
            .map_err(|e| format!("Failed to serialize cat_indices: {}", e))?;
        Ok(crate::common::format::truncate_tool_output(result))
    }
}

impl_es_handler!(EsGetMapping, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, true)?;
    Ok(format!("/{}/_mapping", crate::common::validation::url_encode_segment(index)))
}, false);

impl_es_handler!(EsCreateIndex, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    Ok(format!("/{}", crate::common::validation::url_encode_segment(index)))
}, true);

impl_es_handler!(EsDeleteIndex, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    Ok(format!("/{}", crate::common::validation::url_encode_segment(index)))
}, false);

impl_es_handler!(EsPutMapping, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    Ok(format!("/{}/_mapping", crate::common::validation::url_encode_segment(index)))
}, true);

impl_es_handler!(EsCatAliases, "GET", |_args: &Value| -> Result<String, String> { Ok("/_cat/aliases?format=json".to_string()) }, false);

impl_es_handler!(EsGetAlias, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, true)?;
    Ok(format!("/{}/_alias", crate::common::validation::url_encode_segment(index)))
}, false);

impl_es_handler!(EsPutAlias, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    let name = args.get("name").and_then(|v| v.as_str()).ok_or_else(|| "Missing name".to_string())?;
    Ok(format!("/{}/_alias/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(name)))
}, true);

impl_es_handler!(EsDeleteAlias, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::common::validation::validate_index_name(index, false)?;
    let name = args.get("name").and_then(|v| v.as_str()).ok_or_else(|| "Missing name".to_string())?;
    Ok(format!("/{}/_alias/{}", crate::common::validation::url_encode_segment(index), crate::common::validation::url_encode_segment(name)))
}, false);

impl_es_handler!(EsUpdateAliases, "POST", |_args: &Value| -> Result<String, String> { Ok("/_aliases".to_string()) }, true);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

pub(crate) fn register_all(registry: &mut CapabilityRegistry) {
    // Each entry: (name, description, json_schema_type, is_required).
    // json_schema_type is the OpenAPI type string ("string", "object", "integer", etc.).
    let es_schema = |props: &[(&str, &str, &str, bool)]| -> Value {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "connection_id".to_string(),
            serde_json::json!({"type": "string", "description": "ID of the target connection from the session"}),
        );
        for (name, desc, type_str, _required) in props {
            properties.insert(
                name.to_string(),
                serde_json::json!({"type": type_str, "description": desc}),
            );
        }
        let required: Vec<String> = std::iter::once("connection_id".to_string())
            .chain(props.iter().filter(|(_, _, _, r)| *r).map(|(n, _, _, _)| n.to_string()))
            .collect();
        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required,
        })
    };

    macro_rules! reg {
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr, $parallel_ok:expr) => {
            registry.register(Capability {
                name: $name,
                description: $desc,
                handler: Arc::new($handler),
                input_schema: $schema,
                risk_level: $risk,
                required_permission: $perm,
                source_kind: SourceKind::Database("ELASTICSEARCH"),
                tags: $tags,
                parallel_ok: $parallel_ok,
            });
        };
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr) => {
            reg!($name, $desc, $handler, $schema, $risk, $perm, $tags, false)
        };
    }

    reg!("es__search", "Execute an Elasticsearch search query using Query DSL. Returns matching documents with scores.", EsSearch,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Elasticsearch Query DSL body", "object", true)]),
         RiskLevel::Safe, "read", &["agent"], true);

    reg!("es__get_document", "Get a single document by its ID from an Elasticsearch index.", EsGetDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID", "string", true)]),
         RiskLevel::Safe, "read", &["agent"], true);

    reg!("es__index_document", "Create or replace a document in an Elasticsearch index. Omit id to auto-generate one.", EsIndexDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Optional document ID; omit to auto-generate", "string", false), ("body", "Document body to index", "object", true)]),
         RiskLevel::Elevated, "create", &["agent"]);

    reg!("es__update_document", "Partially update an existing document in an Elasticsearch index using the Update API.", EsUpdateDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID to update", "string", true), ("body", "Update body", "object", true)]),
         RiskLevel::Elevated, "update", &["agent"]);

    reg!("es__delete_document", "Delete a single document by ID from an Elasticsearch index.", EsDeleteDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID to delete", "string", true)]),
         RiskLevel::Destructive, "delete", &["agent"]);

    reg!("es__delete_by_query", "Delete ALL documents matching a query. WARNING: bulk destructive operation.", EsDeleteByQuery,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Query DSL to match documents for deletion", "object", true)]),
         RiskLevel::Destructive, "delete", &["agent"]);

    reg!("es__cat_indices", "List user indices with health status, document count, and storage size. Results are sorted alphabetically. System/hidden indices (starting with . or _) are ONLY included when the user explicitly asks for them — pass include_system=true. NEVER include system indices in routine listing.", EsCatIndices,
         es_schema(&[("include_system", "ONLY set to true when the user explicitly asks for system indices or hidden indices. Default false — system indices are excluded.", "boolean", false)]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("es__get_mapping", "Get the field mapping (schema) for an Elasticsearch index, showing field names and data types.", EsGetMapping,
         es_schema(&[("index", "Target index name", "string", true)]),
         RiskLevel::Safe, "read", &["agent"], true);

    reg!("es__create_index", "Create a new Elasticsearch index with optional custom mappings and settings.", EsCreateIndex,
         es_schema(&[("index", "Name for the new index", "string", true), ("body", "Optional index body with settings and mappings", "object", false)]),
         RiskLevel::Elevated, "create", &["agent"]);

    reg!("es__delete_index", "Delete an entire Elasticsearch index and all its data permanently. This action is IRREVERSIBLE.", EsDeleteIndex,
         es_schema(&[("index", "Name of the index to delete", "string", true)]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("es__put_mapping", "Add or update field mappings in an existing Elasticsearch index.", EsPutMapping,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Mapping body", "object", true)]),
         RiskLevel::Elevated, "update", &["agent"]);

    reg!("es__cat_aliases", "List all index aliases, their target indices, and routing configuration.", EsCatAliases,
         es_schema(&[]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("es__get_alias", "Get the aliases defined on a specific index.", EsGetAlias,
         es_schema(&[("index", "Target index name", "string", true)]),
         RiskLevel::Safe, "read", &["agent"]);

    reg!("es__put_alias", "Create or update an alias pointing to a specific index.", EsPutAlias,
         es_schema(&[("index", "Target index name", "string", true), ("name", "Alias name", "string", true), ("body", "Optional alias body with filter/routing", "object", false)]),
         RiskLevel::Elevated, "update", &["agent"]);

    reg!("es__delete_alias", "Remove an alias from a specific index. Does NOT delete the index or its data.", EsDeleteAlias,
         es_schema(&[("index", "Target index name", "string", true), ("name", "Alias name to remove", "string", true)]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("es__update_aliases", "Atomically add and/or remove multiple aliases in a single operation using the _aliases endpoint.", EsUpdateAliases,
         es_schema(&[("body", "Alias actions body", "object", true)]),
         RiskLevel::Elevated, "update", &["agent"]);
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[cfg(not(target_os = "windows"))]
    fn mock_config(server: &wiremock::MockServer) -> serde_json::Value {
        let addr = server.address();
        json!({"host": format!("http://{}", addr.ip()), "port": addr.port()})
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_execute_es_http_get() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/_cat/indices"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"[{"index":"my-index","health":"green"}]"#,
            ))
            .mount(&server)
            .await;

        let result = super::execute_es_http("GET", "/_cat/indices", None, &mock_config(&server)).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("my-index"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_execute_es_http_post_with_body() {
        use wiremock::matchers::{method, path, body_json};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_search"))
            .and(body_json(json!({"query": {"match_all": {}}})))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"{"hits":{"total":{"value":1},"hits":[]}}"#,
            ))
            .mount(&server)
            .await;

        let result = super::execute_es_http(
            "POST",
            "/my-index/_search",
            Some(r#"{"query":{"match_all":{}}}"#),
            &mock_config(&server),
        )
        .await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        assert!(body.contains("hits"), "response should contain query hits, got: {}", body);
        assert!(body.contains("\"status\":200"), "response should have 200 status, got: {}", body);
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_execute_es_http_handles_404() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(404).set_body_string(r#"{"error":"not_found"}"#))
            .mount(&server)
            .await;

        let result = super::execute_es_http("GET", "/missing", None, &mock_config(&server)).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("404"));
    }

    // ---- Handler-level tests through CapabilityHandler::handle() ----

    #[tokio::test]
    async fn test_handler_rejects_missing_config() {
        use super::EsSearch;
        use super::CapabilityHandler;

        let handler = EsSearch;
        let args = json!({"index": "my-index", "body": {"query": {"match_all": {}}}});
        let result = handler.handle(&args, None).await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("connection config"), "got: {}", err);
    }

    #[tokio::test]
    async fn test_es_search_missing_index() {
        use super::EsSearch;
        use super::CapabilityHandler;

        let handler = EsSearch;
        let config = json!({"host": "http://localhost", "port": 9200});
        let args = json!({"body": {"query": {"match_all": {}}}});
        let result = handler.handle(&args, Some(&config)).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing index"));
    }

    #[tokio::test]
    async fn test_es_get_document_missing_index() {
        use super::EsGetDocument;
        use super::CapabilityHandler;

        let handler = EsGetDocument;
        let config = json!({"host": "http://localhost", "port": 9200});
        let args = json!({"id": "doc-1"});
        let result = handler.handle(&args, Some(&config)).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing index"));
    }

    #[tokio::test]
    async fn test_es_get_document_missing_id() {
        use super::EsGetDocument;
        use super::CapabilityHandler;

        let handler = EsGetDocument;
        let config = json!({"host": "http://localhost", "port": 9200});
        let args = json!({"index": "my-index"});
        let result = handler.handle(&args, Some(&config)).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing id"));
    }

    #[tokio::test]
    async fn test_es_search_invalid_index_name() {
        use super::EsSearch;
        use super::CapabilityHandler;

        let handler = EsSearch;
        let config = json!({"host": "http://localhost", "port": 9200});
        let args = json!({"index": "INVALID/INDEX", "body": {"query": {"match_all": {}}}});
        let result = handler.handle(&args, Some(&config)).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid characters"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_create_index_via_wiremock() {
        use super::EsCreateIndex;
        use super::CapabilityHandler;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/test-index"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsCreateIndex;
        let args = json!({"index": "test-index", "body": {"settings": {"number_of_shards": 1}}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;

        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_delete_index_via_wiremock() {
        use super::EsDeleteIndex;
        use super::CapabilityHandler;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path("/old-index"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsDeleteIndex;
        let args = json!({"index": "old-index"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;

        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_search_happy_path_via_wiremock() {
        use super::EsSearch;
        use super::CapabilityHandler;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_search"))
            .respond_with(
                ResponseTemplate::new(200).set_body_string(
                    r#"{"hits":{"total":{"value":2},"hits":[{"_index":"my-index","_id":"1","_source":{"name":"hello"}}]}}"#,
                ),
            )
            .mount(&server)
            .await;

        let handler = EsSearch;
        let args = json!({"index": "my-index", "body": {"query": {"match_all": {}}}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;

        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        assert!(body.contains("hits"), "expected hits in response, got: {}", body);
        assert!(body.contains("my-index"), "expected index name in response, got: {}", body);
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_handles_non_json_response() {
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/_cat/indices"))
            .respond_with(ResponseTemplate::new(200).set_body_string("plain text response"))
            .mount(&server)
            .await;

        let result = super::execute_es_http("GET", "/_cat/indices?format=json&expand_wildcards=all", None, &mock_config(&server)).await;

        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("plain text response"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_execute_es_http_bad_method() {
        let server = wiremock::MockServer::start().await;
        // reqwest rejects methods with spaces as invalid tokens
        let result =
            super::execute_es_http("BAD METHOD", "/test", None, &mock_config(&server)).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Bad method"));
    }

    // ---- Remaining handler tests ----

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_index_document_with_id() {
        use super::{CapabilityHandler, EsIndexDocument};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_doc/doc-1"))
            .respond_with(ResponseTemplate::new(201).set_body_string(r#"{"_id":"doc-1","result":"created"}"#))
            .mount(&server)
            .await;

        let handler = EsIndexDocument;
        let args = serde_json::json!({"index": "my-index", "id": "doc-1", "body": {"title": "hello"}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("created"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_index_document_without_id() {
        use super::{CapabilityHandler, EsIndexDocument};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_doc"))
            .respond_with(ResponseTemplate::new(201).set_body_string(r#"{"_id":"auto-id","result":"created"}"#))
            .mount(&server)
            .await;

        let handler = EsIndexDocument;
        let args = serde_json::json!({"index": "my-index", "body": {"title": "hello"}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("auto-id"));
    }

    #[tokio::test]
    async fn test_es_index_document_missing_index() {
        use super::{CapabilityHandler, EsIndexDocument};
        let handler = EsIndexDocument;
        let config = serde_json::json!({"host": "http://localhost", "port": 9200});
        let args = serde_json::json!({"body": {"title": "hello"}});
        let result = handler.handle(&args, Some(&config)).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing index"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_update_document_via_wiremock() {
        use super::{CapabilityHandler, EsUpdateDocument};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_update/doc-1"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"_id":"doc-1","result":"updated"}"#))
            .mount(&server)
            .await;

        let handler = EsUpdateDocument;
        let args = serde_json::json!({"index": "my-index", "id": "doc-1", "body": {"doc": {"title": "updated"}}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("updated"));
    }

    #[tokio::test]
    async fn test_es_update_document_missing_id() {
        use super::{CapabilityHandler, EsUpdateDocument};
        let handler = EsUpdateDocument;
        let config = serde_json::json!({"host": "http://localhost", "port": 9200});
        let args = serde_json::json!({"index": "my-index", "body": {"doc": {"title": "updated"}}});
        let result = handler.handle(&args, Some(&config)).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing id"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_delete_document_via_wiremock() {
        use super::{CapabilityHandler, EsDeleteDocument};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path("/my-index/_doc/doc-1"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"_id":"doc-1","result":"deleted"}"#))
            .mount(&server)
            .await;

        let handler = EsDeleteDocument;
        let args = serde_json::json!({"index": "my-index", "id": "doc-1"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("deleted"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_delete_by_query_via_wiremock() {
        use super::{CapabilityHandler, EsDeleteByQuery};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/my-index/_delete_by_query"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"deleted":5}"#))
            .mount(&server)
            .await;

        let handler = EsDeleteByQuery;
        let args = serde_json::json!({"index": "my-index", "body": {"query": {"match_all": {}}}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("deleted"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_get_mapping_via_wiremock() {
        use super::{CapabilityHandler, EsGetMapping};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/my-index/_mapping"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_string(r#"{"my-index":{"mappings":{"properties":{"name":{"type":"text"}}}}}"#),
            )
            .mount(&server)
            .await;

        let handler = EsGetMapping;
        let args = serde_json::json!({"index": "my-index"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("text"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_put_mapping_via_wiremock() {
        use super::{CapabilityHandler, EsPutMapping};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/my-index/_mapping"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsPutMapping;
        let args = serde_json::json!({"index": "my-index", "body": {"properties": {"new_field": {"type": "keyword"}}}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_cat_aliases_via_wiremock() {
        use super::{CapabilityHandler, EsCatAliases};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/_cat/aliases"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"[{"alias":"my-alias","index":"my-index"}]"#,
            ))
            .mount(&server)
            .await;

        let handler = EsCatAliases;
        let args = serde_json::json!({});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("my-alias"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_get_alias_via_wiremock() {
        use super::{CapabilityHandler, EsGetAlias};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/my-index/_alias"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"{"my-index":{"aliases":{"my-alias":{}}}}"#,
            ))
            .mount(&server)
            .await;

        let handler = EsGetAlias;
        let args = serde_json::json!({"index": "my-index"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("my-alias"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_put_alias_via_wiremock() {
        use super::{CapabilityHandler, EsPutAlias};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/my-index/_alias/my-alias"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsPutAlias;
        let args = serde_json::json!({"index": "my-index", "name": "my-alias"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_delete_alias_via_wiremock() {
        use super::{CapabilityHandler, EsDeleteAlias};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("DELETE"))
            .and(path("/my-index/_alias/my-alias"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsDeleteAlias;
        let args = serde_json::json!({"index": "my-index", "name": "my-alias"});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_update_aliases_via_wiremock() {
        use super::{CapabilityHandler, EsUpdateAliases};
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/_aliases"))
            .respond_with(ResponseTemplate::new(200).set_body_string(r#"{"acknowledged":true}"#))
            .mount(&server)
            .await;

        let handler = EsUpdateAliases;
        let args = serde_json::json!({"body": {"actions": [{"add": {"index": "my-index", "alias": "my-alias"}}]}});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        assert!(result.unwrap().contains("acknowledged"));
    }

    // ---- EsCatIndices specific tests ----

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_cat_indices_include_system() {
        use super::CapabilityHandler;
        use wiremock::matchers::{method, path, query_param};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/_cat/indices"))
            .and(query_param("expand_wildcards", "all"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"[
                    {"index":".system-index","health":"green"},
                    {"index":"user-index","health":"yellow"},
                    {"index":"_internal","health":"green"}
                ]"#,
            ))
            .mount(&server)
            .await;

        let handler = super::EsCatIndices;
        let args = serde_json::json!({"include_system": true});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        assert!(body.contains("user-index"), "should include user indices");
        assert!(body.contains(".system-index"), "should include system indices when requested");
        assert!(body.contains("_internal"), "should include internal indices");
    }

    #[cfg(not(target_os = "windows"))]
    #[tokio::test]
    async fn test_es_cat_indices_sorts_results() {
        use super::CapabilityHandler;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/_cat/indices"))
            .respond_with(ResponseTemplate::new(200).set_body_string(
                r#"[
                    {"index":"z-last","health":"green"},
                    {"index":"a-first","health":"green"},
                    {"index":"m-middle","health":"yellow"}
                ]"#,
            ))
            .mount(&server)
            .await;

        let handler = super::EsCatIndices;
        let args = serde_json::json!({});
        let result = handler.handle(&args, Some(&mock_config(&server))).await;
        assert!(result.is_ok(), "got: {:?}", result.err());
        let body = result.unwrap();
        // All three index names should appear in the response
        assert!(body.contains("a-first"));
        assert!(body.contains("m-middle"));
        assert!(body.contains("z-last"));
    }

    // ---- register_all ----

    #[tokio::test]
    async fn test_es_register_all_registers_capabilities() {
        use crate::capabilities::registry::CapabilityRegistry;

        let mut reg = CapabilityRegistry::new();
        super::register_all(&mut reg);

        assert!(reg.get("es__search").is_some());
        assert!(reg.get("es__get_document").is_some());
        assert!(reg.get("es__index_document").is_some());
        assert!(reg.get("es__update_document").is_some());
        assert!(reg.get("es__delete_document").is_some());
        assert!(reg.get("es__delete_by_query").is_some());
        assert!(reg.get("es__cat_indices").is_some());
        assert!(reg.get("es__get_mapping").is_some());
        assert!(reg.get("es__create_index").is_some());
        assert!(reg.get("es__delete_index").is_some());
        assert!(reg.get("es__put_mapping").is_some());
        assert!(reg.get("es__cat_aliases").is_some());
        assert!(reg.get("es__get_alias").is_some());
        assert!(reg.get("es__put_alias").is_some());
        assert!(reg.get("es__delete_alias").is_some());
        assert!(reg.get("es__update_aliases").is_some());

        let all_agent = reg.agent_tools();
        let es_agent: Vec<_> = all_agent
            .iter()
            .filter(|c| c.name.starts_with("es__"))
            .collect();
        assert_eq!(es_agent.len(), 16, "expected 16 ES capabilities tagged for agent");
    }
}
