use serde_json::{json, Value};

pub use crate::capabilities::RiskLevel;

pub struct ToolDefinition {
    pub name: &'static str,
    description: &'static str,
    parameters: Value,
    pub risk_level: RiskLevel,
    pub required_permission: &'static str,
}

pub fn all_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "es__search",
            description: "Execute an Elasticsearch search query using Query DSL. Returns matching documents with scores. Use for finding, filtering, and aggregating data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "body": { "type": "object", "description": "Elasticsearch Query DSL body (e.g. {\"query\":{\"match_all\":{}}})" }
                },
                "required": ["connection_id", "index", "body"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__get_document",
            description: "Get a single document by its ID from an Elasticsearch index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID" }
                },
                "required": ["connection_id", "index", "id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__index_document",
            description: "Create or replace a document in an Elasticsearch index. Omit id to auto-generate one.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Optional document ID; omit to auto-generate" },
                    "body": { "type": "object", "description": "Document body to index" }
                },
                "required": ["connection_id", "index", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
        },
        ToolDefinition {
            name: "es__update_document",
            description: "Partially update an existing document in an Elasticsearch index using the Update API.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID to update" },
                    "body": { "type": "object", "description": "Update body, e.g. {\"doc\":{\"field\":\"value\"}}" }
                },
                "required": ["connection_id", "index", "id", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
        },
        ToolDefinition {
            name: "es__delete_document",
            description: "Delete a single document by ID from an Elasticsearch index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID to delete" }
                },
                "required": ["connection_id", "index", "id"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
            name: "es__delete_by_query",
            description: "Delete ALL documents matching a query. WARNING: bulk destructive operation that can affect many documents.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "body": { "type": "object", "description": "Query DSL to match documents for deletion" }
                },
                "required": ["connection_id", "index", "body"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
            name: "es__cat_indices",
            description: "List all indices with health status, document count, and storage size.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__get_mapping",
            description: "Get the field mapping (schema) for an Elasticsearch index, showing field names and data types.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" }
                },
                "required": ["connection_id", "index"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__create_index",
            description: "Create a new Elasticsearch index with optional custom mappings and settings.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Name for the new index" },
                    "body": { "type": "object", "description": "Optional index body with settings and mappings, e.g. {\"settings\":{\"number_of_shards\":1},\"mappings\":{\"properties\":{...}}}" }
                },
                "required": ["connection_id", "index"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
        },
        ToolDefinition {
            name: "es__delete_index",
            description: "Delete an entire Elasticsearch index and all its data permanently. This action is IRREVERSIBLE.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Name of the index to delete" }
                },
                "required": ["connection_id", "index"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
            name: "es__put_mapping",
            description: "Add or update field mappings in an existing Elasticsearch index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "body": { "type": "object", "description": "Mapping body, e.g. {\"properties\":{\"field_name\":{\"type\":\"text\"}}}" }
                },
                "required": ["connection_id", "index", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
        },
        ToolDefinition {
            name: "es__cat_aliases",
            description: "List all index aliases, their target indices, and routing configuration.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__get_alias",
            description: "Get the aliases defined on a specific index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" }
                },
                "required": ["connection_id", "index"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "es__put_alias",
            description: "Create or update an alias pointing to a specific index. Optionally include filter and routing settings.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "name": { "type": "string", "description": "Alias name" },
                    "body": { "type": "object", "description": "Optional alias body with filter/routing, e.g. {\"filter\":{\"term\":{\"user\":\"kimchy\"}}}" }
                },
                "required": ["connection_id", "index", "name"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
        },
        ToolDefinition {
            name: "es__delete_alias",
            description: "Remove an alias from a specific index. Does NOT delete the index or its data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "index": { "type": "string", "description": "Target index name" },
                    "name": { "type": "string", "description": "Alias name to remove" }
                },
                "required": ["connection_id", "index", "name"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
            name: "es__update_aliases",
            description: "Atomically add and/or remove multiple aliases in a single operation using the _aliases endpoint.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "body": { "type": "object", "description": "Alias actions body, e.g. {\"actions\":[{\"add\":{\"index\":\"a\",\"alias\":\"b\"}},{\"remove\":{\"index\":\"c\",\"alias\":\"d\"}}]}" }
                },
                "required": ["connection_id", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
        },
        ToolDefinition {
            name: "dynamo__execute_query",
            description: "Execute a PartiQL SELECT query against DynamoDB. Use for reading and querying table data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "statement": { "type": "string", "description": "PartiQL SELECT statement, e.g. SELECT * FROM \"MyTable\" WHERE pk = 'value'" }
                },
                "required": ["connection_id", "statement"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "dynamo__execute_write",
            description: "Execute a PartiQL INSERT or UPDATE statement against DynamoDB.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "statement": { "type": "string", "description": "PartiQL INSERT or UPDATE statement" }
                },
                "required": ["connection_id", "statement"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
        },
        ToolDefinition {
            name: "dynamo__execute_delete",
            description: "Execute a PartiQL DELETE statement against DynamoDB. DESTRUCTIVE: permanently removes data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "statement": { "type": "string", "description": "PartiQL DELETE statement" }
                },
                "required": ["connection_id", "statement"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
             name: "mongo__find",
            description: "Query documents from a MongoDB collection using a filter. Returns matching documents. Use for reading and searching data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." },
                    "collection": { "type": "string", "description": "Collection name to query" },
                    "filter": { "type": "object", "description": "MongoDB query filter, e.g. {\"status\": \"active\"}. Use {} for all documents." },
                    "projection": { "type": "object", "description": "Optional fields to include/exclude, e.g. {\"name\": 1, \"_id\": 0}" },
                    "limit": { "type": "integer", "description": "Maximum number of documents to return (default 20, max 100)" },
                    "sort": { "type": "object", "description": "Optional sort specification, e.g. {\"createdAt\": -1}" }
                },
                "required": ["connection_id", "collection", "filter"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "mongo__aggregate",
            description: "Execute a MongoDB aggregation pipeline on a collection. Use for complex queries, grouping, and transformations. Note: $out and $merge stages are allowed but will modify data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." },
                    "collection": { "type": "string", "description": "Collection name" },
                    "pipeline": { "type": "array", "description": "Aggregation pipeline stages, e.g. [{\"$match\": {\"status\": \"active\"}}, {\"$group\": {\"_id\": \"$category\", \"count\": {\"$sum\": 1}}}]" }
                },
                "required": ["connection_id", "collection", "pipeline"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "read",
        },
        ToolDefinition {
            name: "mongo__insert_one",
            description: "Insert a single document into a MongoDB collection.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." },
                    "collection": { "type": "string", "description": "Collection name" },
                    "document": { "type": "object", "description": "Document to insert" }
                },
                "required": ["connection_id", "collection", "document"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
        },
        ToolDefinition {
            name: "mongo__update_many",
            description: "Update documents in a MongoDB collection matching a filter. Use $set, $unset, $inc and other update operators.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." },
                    "collection": { "type": "string", "description": "Collection name" },
                    "filter": { "type": "object", "description": "Filter to match documents to update" },
                    "update": { "type": "object", "description": "Update operations, e.g. {\"$set\": {\"status\": \"inactive\"}}" },
                    "upsert": { "type": "boolean", "description": "If true, insert a document if none matches the filter (default false)" }
                },
                "required": ["connection_id", "collection", "filter", "update"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
        },
        ToolDefinition {
            name: "mongo__delete_many",
            description: "Delete documents from a MongoDB collection matching a filter. DESTRUCTIVE: permanently removes data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." },
                    "collection": { "type": "string", "description": "Collection name" },
                    "filter": { "type": "object", "description": "Filter to match documents to delete. Use {} to delete ALL documents." }
                },
                "required": ["connection_id", "collection", "filter"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
        },
        ToolDefinition {
            name: "mongo__list_collections",
            description: "List all collection names in a MongoDB database.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "database": { "type": "string", "description": "MongoDB database name. Required if the connection has no default database." }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "mongo__list_databases",
            description: "List all database names on a MongoDB server. Use this first when no database is known so you can pick one for subsequent calls.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "dynamo__describe_table",
            description: "Describe a DynamoDB table schema: key schema, attribute definitions, indexes, and throughput.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" },
                    "table_name": { "type": "string", "description": "DynamoDB table name" }
                },
                "required": ["connection_id", "table_name"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "dynamo__list_tables",
            description: "List all DynamoDB table names in the connected account and region.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "connection_id": { "type": "string", "description": "ID of the target connection from the session" }
                },
                "required": ["connection_id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
        },
        ToolDefinition {
            name: "dockit__list_connections",
            description: "List all configured database connections in DocKit with their name, type, and connection id.",
            parameters: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "none",
        },
    ]
}

fn to_openai_tool(tool: &ToolDefinition) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters.clone()
        }
    })
}

fn to_metadata(tool: &ToolDefinition) -> Value {
    json!({
        "riskLevel": tool.risk_level,
        "requiredPermission": tool.required_permission
    })
}

/// Return the required parameter names for a tool, as a human-readable string.
/// Used in parse-failure error messages to help the LLM self-correct.
pub fn get_tool_required_params(tool_name: &str) -> Option<String> {
    let tool = all_tools().into_iter().find(|t| t.name == tool_name)?;
    let params = tool.parameters.get("properties")?.as_object()?;
    let required = tool
        .parameters
        .get("required")?
        .as_array()?
        .iter()
        .filter_map(|r| r.as_str())
        .collect::<Vec<_>>();
    if required.is_empty() {
        return None;
    }
    let details: Vec<String> = required
        .iter()
        .map(|name| {
            let type_str = params
                .get(*name)
                .and_then(|p| p.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("unknown");
            format!("{} ({})", name, type_str)
        })
        .collect();
    Some(details.join(", "))
}

#[tauri::command]
pub fn get_all_tools() -> Result<String, String> {
    let tools = all_tools();

    let openai_tools: Vec<Value> = tools.iter().map(to_openai_tool).collect();

    let metadata: serde_json::Map<String, Value> = tools
        .iter()
        .map(|t| (t.name.to_string(), to_metadata(t)))
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}
