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
pub struct ConnectionSource {
    pub connection_id: String,
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
            name: "es__search",
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
            name: "es__get_document",
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
            name: "es__index_document",
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
            name: "es__update_document",
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
            name: "es__delete_document",
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
            name: "es__delete_by_query",
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
            name: "es__cat_indices",
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
            name: "es__get_mapping",
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
            name: "dynamo__execute_query",
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
            name: "dynamo__execute_write",
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
            name: "dynamo__execute_delete",
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
            name: "dynamo__describe_table",
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

fn normalize_database_type(database_type: &str) -> Option<&'static str> {
    match database_type {
        "ELASTICSEARCH" | "OPENSEARCH" | "EASYSEARCH" => Some("ELASTICSEARCH"),
        "DYNAMODB" => Some("DYNAMODB"),
        _ => None,
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

fn tools_for_database_type(database_type: &str, permissions: &Permissions) -> Vec<ToolDefinition> {
    let Some(effective_type) = normalize_database_type(database_type) else {
        return vec![];
    };

    all_tools()
        .into_iter()
        .filter(|tool| {
            tool.database_type == effective_type
                && has_permission(permissions, tool.required_permission)
        })
        .collect()
}

fn inject_connection_id(mut parameters: Value, connection_ids: &[String]) -> Value {
    if let Some(props) = parameters.get_mut("properties").and_then(|p| p.as_object_mut()) {
        props.insert(
            "connection_id".to_string(),
            json!({
                "type": "string",
                "description": "The connection ID to target. Must be one of the attached sources.",
                "enum": connection_ids
            }),
        );
    }

    if let Some(required) = parameters.get_mut("required").and_then(|r| r.as_array_mut()) {
        if !required.iter().any(|v| v.as_str() == Some("connection_id")) {
            required.push(json!("connection_id"));
        }
    } else {
        parameters["required"] = json!(["connection_id"]);
    }

    parameters
}

fn to_openai_tool(tool: &ToolDefinition, connection_ids: &[String]) -> Value {
    let parameters = inject_connection_id(tool.parameters.clone(), connection_ids);
    json!({
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": parameters
        }
    })
}

fn to_metadata(tool: &ToolDefinition) -> Value {
    json!({
        "riskLevel": tool.risk_level,
        "requiredPermission": tool.required_permission
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
    let connection_ids: Vec<String> = vec![];

    let openai_tools: Vec<Value> = filtered
        .iter()
        .map(|t| to_openai_tool(t, &connection_ids))
        .collect();

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
pub fn get_available_tools_for_sources(
    sources: Vec<ConnectionSource>,
) -> Result<String, String> {
    let mut tool_connection_ids: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    let mut tool_defs: std::collections::HashMap<String, &'static str> =
        std::collections::HashMap::new();

    let all_tool_definitions = all_tools();
    let pairs: Vec<(String, &ToolDefinition)> = sources
        .iter()
        .flat_map(|source| {
            let permissions = Permissions {
                read: source.read,
                create: source.create,
                update: source.update,
                delete: source.delete,
            };
            let effective_type = match normalize_database_type(source.database_type.as_str()) {
                Some(t) => t,
                None => return vec![],
            };
            all_tool_definitions
                .iter()
                .filter(|tool| {
                    tool.database_type == effective_type
                        && has_permission(&permissions, tool.required_permission)
                })
                .map(|tool| (source.connection_id.clone(), tool))
                .collect::<Vec<_>>()
        })
        .collect();

    for (conn_id, tool) in &pairs {
        tool_connection_ids
            .entry(tool.name.to_string())
            .or_default()
            .push(conn_id.clone());
        tool_defs.insert(tool.name.to_string(), tool.name);
    }

    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let openai_tools: Vec<Value> = pairs
        .iter()
        .filter_map(|(_, tool)| {
            if seen.insert(tool.name.to_string()) {
                let conn_ids = tool_connection_ids
                    .get(tool.name)
                    .cloned()
                    .unwrap_or_default();
                Some(to_openai_tool(tool, &conn_ids))
            } else {
                None
            }
        })
        .collect();

    let metadata: serde_json::Map<String, Value> = {
        let mut m = serde_json::Map::new();
        let mut seen_meta: std::collections::HashSet<String> = std::collections::HashSet::new();
        for (_, tool) in &pairs {
            if seen_meta.insert(tool.name.to_string()) {
                m.insert(tool.name.to_string(), to_metadata(tool));
            }
        }
        m
    };

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}
