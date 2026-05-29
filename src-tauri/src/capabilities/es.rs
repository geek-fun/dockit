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
    let base_url = crate::agent::executor::build_es_base_url(config)?;
    let headers = crate::agent::executor::build_es_headers(config);
    let ssl = crate::agent::executor::get_es_ssl_flag(config);
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

    let result = serde_json::json!({
        "status": status,
        "data": serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body))
    });

    Ok(crate::agent::executor::truncate_tool_output(result.to_string()))
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
    crate::agent::executor::validate_index_name(index, true)?;
    Ok(format!("/{}/_search", crate::agent::executor::url_encode_segment(index)))
}, true);

impl_es_handler!(EsGetDocument, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, true)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_doc/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(id)))
}, false);

impl_es_handler!(EsIndexDocument, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    match args.get("id").and_then(|v| v.as_str()) {
        Some(id) => Ok(format!("/{}/_doc/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(id))),
        None => Ok(format!("/{}/_doc", crate::agent::executor::url_encode_segment(index))),
    }
}, true);

impl_es_handler!(EsUpdateDocument, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_update/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(id)))
}, true);

impl_es_handler!(EsDeleteDocument, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| "Missing id".to_string())?;
    Ok(format!("/{}/_doc/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(id)))
}, false);

impl_es_handler!(EsDeleteByQuery, "POST", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    Ok(format!("/{}/_delete_by_query", crate::agent::executor::url_encode_segment(index)))
}, true);

impl_es_handler!(EsCatIndices, "GET", |_args: &Value| -> Result<String, String> { Ok("/_cat/indices?format=json".to_string()) }, false);

impl_es_handler!(EsGetMapping, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, true)?;
    Ok(format!("/{}/_mapping", crate::agent::executor::url_encode_segment(index)))
}, false);

impl_es_handler!(EsCreateIndex, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    Ok(format!("/{}", crate::agent::executor::url_encode_segment(index)))
}, true);

impl_es_handler!(EsDeleteIndex, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    Ok(format!("/{}", crate::agent::executor::url_encode_segment(index)))
}, false);

impl_es_handler!(EsPutMapping, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    Ok(format!("/{}/_mapping", crate::agent::executor::url_encode_segment(index)))
}, true);

impl_es_handler!(EsCatAliases, "GET", |_args: &Value| -> Result<String, String> { Ok("/_cat/aliases?format=json".to_string()) }, false);

impl_es_handler!(EsGetAlias, "GET", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, true)?;
    Ok(format!("/{}/_alias", crate::agent::executor::url_encode_segment(index)))
}, false);

impl_es_handler!(EsPutAlias, "PUT", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    let name = args.get("name").and_then(|v| v.as_str()).ok_or_else(|| "Missing name".to_string())?;
    Ok(format!("/{}/_alias/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(name)))
}, true);

impl_es_handler!(EsDeleteAlias, "DELETE", |args: &Value| -> Result<String, String> {
    let index = args.get("index").and_then(|v| v.as_str()).ok_or_else(|| "Missing index".to_string())?;
    crate::agent::executor::validate_index_name(index, false)?;
    let name = args.get("name").and_then(|v| v.as_str()).ok_or_else(|| "Missing name".to_string())?;
    Ok(format!("/{}/_alias/{}", crate::agent::executor::url_encode_segment(index), crate::agent::executor::url_encode_segment(name)))
}, false);

impl_es_handler!(EsUpdateAliases, "POST", |_args: &Value| -> Result<String, String> { Ok("/_aliases".to_string()) }, true);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

pub(crate) fn register_all(registry: &mut CapabilityRegistry) {
    /// Each entry: (name, description, json_schema_type, is_required).
    /// json_schema_type is the OpenAPI type string ("string", "object", "integer", etc.).
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
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr) => {
            registry.register(Capability {
                name: $name,
                description: $desc,
                handler: Arc::new($handler),
                input_schema: $schema,
                risk_level: $risk,
                required_permission: $perm,
                source_kind: SourceKind::Database("ELASTICSEARCH"),
                tags: &["agent"],
            });
        };
    }

    reg!("es__search", "Execute an Elasticsearch search query using Query DSL. Returns matching documents with scores.", EsSearch,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Elasticsearch Query DSL body", "object", true)]),
         RiskLevel::Safe, "read");

    reg!("es__get_document", "Get a single document by its ID from an Elasticsearch index.", EsGetDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID", "string", true)]),
         RiskLevel::Safe, "read");

    reg!("es__index_document", "Create or replace a document in an Elasticsearch index. Omit id to auto-generate one.", EsIndexDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Optional document ID; omit to auto-generate", "string", false), ("body", "Document body to index", "object", true)]),
         RiskLevel::Elevated, "create");

    reg!("es__update_document", "Partially update an existing document in an Elasticsearch index using the Update API.", EsUpdateDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID to update", "string", true), ("body", "Update body", "object", true)]),
         RiskLevel::Elevated, "update");

    reg!("es__delete_document", "Delete a single document by ID from an Elasticsearch index.", EsDeleteDocument,
         es_schema(&[("index", "Target index name", "string", true), ("id", "Document ID to delete", "string", true)]),
         RiskLevel::Destructive, "delete");

    reg!("es__delete_by_query", "Delete ALL documents matching a query. WARNING: bulk destructive operation.", EsDeleteByQuery,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Query DSL to match documents for deletion", "object", true)]),
         RiskLevel::Destructive, "delete");

    reg!("es__cat_indices", "List all indices with health status, document count, and storage size.", EsCatIndices,
         es_schema(&[]),
         RiskLevel::Safe, "read");

    reg!("es__get_mapping", "Get the field mapping (schema) for an Elasticsearch index, showing field names and data types.", EsGetMapping,
         es_schema(&[("index", "Target index name", "string", true)]),
         RiskLevel::Safe, "read");

    reg!("es__create_index", "Create a new Elasticsearch index with optional custom mappings and settings.", EsCreateIndex,
         es_schema(&[("index", "Name for the new index", "string", true), ("body", "Optional index body with settings and mappings", "object", false)]),
         RiskLevel::Elevated, "create");

    reg!("es__delete_index", "Delete an entire Elasticsearch index and all its data permanently. This action is IRREVERSIBLE.", EsDeleteIndex,
         es_schema(&[("index", "Name of the index to delete", "string", true)]),
         RiskLevel::Destructive, "delete");

    reg!("es__put_mapping", "Add or update field mappings in an existing Elasticsearch index.", EsPutMapping,
         es_schema(&[("index", "Target index name", "string", true), ("body", "Mapping body", "object", true)]),
         RiskLevel::Elevated, "update");

    reg!("es__cat_aliases", "List all index aliases, their target indices, and routing configuration.", EsCatAliases,
         es_schema(&[]),
         RiskLevel::Safe, "read");

    reg!("es__get_alias", "Get the aliases defined on a specific index.", EsGetAlias,
         es_schema(&[("index", "Target index name", "string", true)]),
         RiskLevel::Safe, "read");

    reg!("es__put_alias", "Create or update an alias pointing to a specific index.", EsPutAlias,
         es_schema(&[("index", "Target index name", "string", true), ("name", "Alias name", "string", true), ("body", "Optional alias body with filter/routing", "object", false)]),
         RiskLevel::Elevated, "update");

    reg!("es__delete_alias", "Remove an alias from a specific index. Does NOT delete the index or its data.", EsDeleteAlias,
         es_schema(&[("index", "Target index name", "string", true), ("name", "Alias name to remove", "string", true)]),
         RiskLevel::Destructive, "delete");

    reg!("es__update_aliases", "Atomically add and/or remove multiple aliases in a single operation using the _aliases endpoint.", EsUpdateAliases,
         es_schema(&[("body", "Alias actions body", "object", true)]),
         RiskLevel::Elevated, "update");
}
