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

fn has_permission(permissions: &Permissions, required: &str) -> bool {
    match required {
        "read" => permissions.read,
        "create" => permissions.create,
        "update" => permissions.update,
        "delete" => permissions.delete,
        _ => false,
    }
}

fn to_openai_tool(tool: &ToolDefinition) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": tool.name,
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

    let filtered: Vec<ToolDefinition> = all_tools()
        .into_iter()
        .filter(|t| {
            t.database_type == database_type.as_str()
                && has_permission(&permissions, t.required_permission)
        })
        .collect();

    let openai_tools: Vec<Value> = filtered.iter().map(|t| to_openai_tool(t)).collect();

    let metadata: serde_json::Map<String, Value> = filtered
        .iter()
        .map(|t| {
            (
                t.name.to_string(),
                json!({
                    "riskLevel": t.risk_level,
                    "requiredPermission": t.required_permission
                }),
            )
        })
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}
