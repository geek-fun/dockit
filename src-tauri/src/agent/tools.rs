use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,
    Elevated,
    Destructive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permissions {
    pub read: bool,
    pub create: bool,
    pub update: bool,
    pub delete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePermissions {
    pub alias: String,
    pub database_type: String,
    pub read: bool,
    pub create: bool,
    pub update: bool,
    pub delete: bool,
}

struct ToolDefinition {
    name: &'static str,
    description: &'static str,
    parameters: Value,
    risk_level: RiskLevel,
    required_permission: &'static str,
    database_type: &'static str,
}

fn all_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "es.search",
            description: "Execute an Elasticsearch search query using Query DSL. Returns matching documents with scores. Use for finding, filtering, and aggregating data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "body": { "type": "object", "description": "Elasticsearch Query DSL body (e.g. {\"query\":{\"match_all\":{}}})" }
                },
                "required": ["index", "body"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.get_document",
            description: "Get a single document by its ID from an Elasticsearch index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID" }
                },
                "required": ["index", "id"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.index_document",
            description: "Create or replace a document in an Elasticsearch index. Omit id to auto-generate one.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Optional document ID; omit to auto-generate" },
                    "body": { "type": "object", "description": "Document body to index" }
                },
                "required": ["index", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.update_document",
            description: "Partially update an existing document in an Elasticsearch index using the Update API.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID to update" },
                    "body": { "type": "object", "description": "Update body, e.g. {\"doc\":{\"field\":\"value\"}}" }
                },
                "required": ["index", "id", "body"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "update",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.delete_document",
            description: "Delete a single document by ID from an Elasticsearch index.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "id": { "type": "string", "description": "Document ID to delete" }
                },
                "required": ["index", "id"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.delete_by_query",
            description: "Delete ALL documents matching a query. WARNING: bulk destructive operation that can affect many documents.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" },
                    "body": { "type": "object", "description": "Query DSL to match documents for deletion" }
                },
                "required": ["index", "body"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.cat_indices",
            description: "List all indices with health status, document count, and storage size.",
            parameters: json!({
                "type": "object",
                "properties": {}
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "es.get_mapping",
            description: "Get the field mapping (schema) for an Elasticsearch index, showing field names and data types.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "index": { "type": "string", "description": "Target index name" }
                },
                "required": ["index"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "ELASTICSEARCH",
        },
        ToolDefinition {
            name: "dynamo.execute_query",
            description: "Execute a PartiQL SELECT query against DynamoDB. Use for reading and querying table data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "statement": { "type": "string", "description": "PartiQL SELECT statement, e.g. SELECT * FROM \"MyTable\" WHERE pk = 'value'" }
                },
                "required": ["statement"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "DYNAMODB",
        },
        ToolDefinition {
            name: "dynamo.execute_write",
            description: "Execute a PartiQL INSERT or UPDATE statement against DynamoDB.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "statement": { "type": "string", "description": "PartiQL INSERT or UPDATE statement" }
                },
                "required": ["statement"]
            }),
            risk_level: RiskLevel::Elevated,
            required_permission: "create",
            database_type: "DYNAMODB",
        },
        ToolDefinition {
            name: "dynamo.execute_delete",
            description: "Execute a PartiQL DELETE statement against DynamoDB. DESTRUCTIVE: permanently removes data.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "statement": { "type": "string", "description": "PartiQL DELETE statement" }
                },
                "required": ["statement"]
            }),
            risk_level: RiskLevel::Destructive,
            required_permission: "delete",
            database_type: "DYNAMODB",
        },
        ToolDefinition {
            name: "dynamo.describe_table",
            description: "Describe a DynamoDB table schema: key schema, attribute definitions, indexes, and throughput.",
            parameters: json!({
                "type": "object",
                "properties": {
                    "table_name": { "type": "string", "description": "DynamoDB table name" }
                },
                "required": ["table_name"]
            }),
            risk_level: RiskLevel::Safe,
            required_permission: "read",
            database_type: "DYNAMODB",
        },
    ]
}

fn normalize_database_type(database_type: &str) -> &'static str {
    match database_type {
        "OPENSEARCH" | "EASYSEARCH" => "ELASTICSEARCH",
        "DYNAMODB" => "DYNAMODB",
        _ => "ELASTICSEARCH",
    }
}

fn has_permission(permissions: &Permissions, required: &str) -> bool {
    match required {
        "read" => permissions.read,
        "create" => permissions.create,
        "update" => permissions.update,
        "delete" => permissions.delete,
        _ => false,
    }
}

fn internal_to_openai_name(name: &str) -> String {
    name.replace('.', "__")
}

pub fn openai_name_to_internal(name: &str) -> String {
    let without_alias = alias_suffix(name);
    without_alias.replace("__", ".")
}

pub fn alias_from_prefixed_name(name: &str) -> Option<String> {
    let sep = name.find("__es__").or_else(|| name.find("__dynamo__"))?;
    Some(name[..sep].to_string())
}

fn alias_suffix(name: &str) -> &str {
    if let Some(pos) = name.find("__es__").or_else(|| name.find("__dynamo__")) {
        &name[pos + 2..]
    } else {
        name
    }
}

fn to_openai_tool(tool: &ToolDefinition) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": internal_to_openai_name(tool.name),
            "description": tool.description,
            "parameters": tool.parameters
        }
    })
}

fn to_metadata(tool: &ToolDefinition) -> Value {
    json!({
        "riskLevel": tool.risk_level,
        "requiredPermission": tool.required_permission
    })
}

fn prefixed_openai_name(alias: &str, tool_name: &str) -> String {
    format!("{alias}__{}", internal_to_openai_name(tool_name))
}

fn tools_for_database_type(database_type: &str, permissions: &Permissions) -> Vec<ToolDefinition> {
    let effective_type = normalize_database_type(database_type);

    all_tools()
        .into_iter()
        .filter(|tool| {
            tool.database_type == effective_type
                && has_permission(permissions, tool.required_permission)
        })
        .collect()
}

fn to_openai_tool_multi(tool: &ToolDefinition, alias: &str) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": prefixed_openai_name(alias, tool.name),
            "description": tool.description,
            "parameters": tool.parameters
        }
    })
}

#[tauri::command]
pub fn get_available_tools(
    database_type: String,
    read: bool,
    create: bool,
    update: bool,
    delete: bool,
) -> Result<String, String> {
    let permissions = Permissions {
        read,
        create,
        update,
        delete,
    };

    let filtered = tools_for_database_type(database_type.as_str(), &permissions);

    let openai_tools: Vec<Value> = filtered.iter().map(|t| to_openai_tool(t)).collect();

    let metadata: serde_json::Map<String, Value> = filtered
        .iter()
        .map(|t| (t.name.to_string(), to_metadata(t)))
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_available_tools_multi(sources: Vec<SourcePermissions>) -> Result<String, String> {
    let filtered_tools: Vec<(String, ToolDefinition)> = sources
        .iter()
        .flat_map(|source| {
            let permissions = Permissions {
                read: source.read,
                create: source.create,
                update: source.update,
                delete: source.delete,
            };

            tools_for_database_type(source.database_type.as_str(), &permissions)
                .into_iter()
                .map(move |tool| (source.alias.clone(), tool))
        })
        .collect();

    let openai_tools: Vec<Value> = filtered_tools
        .iter()
        .map(|(alias, tool)| to_openai_tool_multi(tool, alias))
        .collect();

    let metadata: serde_json::Map<String, Value> = filtered_tools
        .iter()
        .map(|(alias, tool)| (prefixed_openai_name(alias, tool.name), to_metadata(tool)))
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}
