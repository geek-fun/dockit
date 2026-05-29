use std::sync::Arc;

use serde_json::Value;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// DynamoDB capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct DynamoExecuteQuery;
pub(crate) struct DynamoExecuteWrite;
pub(crate) struct DynamoExecuteDelete;
pub(crate) struct DynamoDescribeTable;
pub(crate) struct DynamoListTables;

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteQuery {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args.get("statement").and_then(|v| v.as_str()).ok_or("Missing statement")?;
        crate::agent::executor::validate_dynamo_statement("dynamo__execute_query", statement)?;
        let client = crate::agent::executor::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::agent::executor::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteWrite {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args.get("statement").and_then(|v| v.as_str()).ok_or("Missing statement")?;
        crate::agent::executor::validate_dynamo_statement("dynamo__execute_write", statement)?;
        let client = crate::agent::executor::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::agent::executor::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteDelete {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args.get("statement").and_then(|v| v.as_str()).ok_or("Missing statement")?;
        crate::agent::executor::validate_dynamo_statement("dynamo__execute_delete", statement)?;
        let client = crate::agent::executor::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::agent::executor::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::agent::executor::create_dynamo_client(config).await?;
        let response = crate::dynamo::describe_table::describe_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::agent::executor::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoListTables {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let client = crate::agent::executor::create_dynamo_client(config).await?;
        let response = crate::dynamo::list_tables::list_tables(&client).await?;
        serde_json::to_string(&response)
            .map(crate::agent::executor::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

pub(crate) fn register_all(registry: &mut CapabilityRegistry) {
    let dynamo_schema = |props: &[(&str, &str, bool)]| -> Value {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "connection_id".to_string(),
            serde_json::json!({"type": "string", "description": "ID of the target connection from the session"}),
        );
        for (name, desc, _required) in props {
            properties.insert(
                name.to_string(),
                serde_json::json!({"type": "string", "description": desc}),
            );
        }
        let required: Vec<String> = std::iter::once("connection_id".to_string())
            .chain(props.iter().filter(|(_, _, r)| *r).map(|(n, _, _)| n.to_string()))
            .collect();
        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required,
        })
    };

    macro_rules! reg {
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr) => {
            registry.register(Capability {
                name: $name,
                description: $desc,
                handler: Arc::new($handler),
                input_schema: $schema,
                risk_level: $risk,
                required_permission: $perm,
                source_kind: SourceKind::Database("DYNAMODB"),
                tags: $tags,
            });
        };
    }

    reg!("dynamo__execute_query", "Execute a PartiQL SELECT query against DynamoDB. Use for reading and querying table data.",
         DynamoExecuteQuery,
         dynamo_schema(&[("statement", "PartiQL SELECT statement", true)]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("dynamo__execute_write", "Execute a PartiQL INSERT or UPDATE statement against DynamoDB.",
         DynamoExecuteWrite,
         dynamo_schema(&[("statement", "PartiQL INSERT or UPDATE statement", true)]),
         RiskLevel::Elevated, "create", &["agent", "ui"]);

    reg!("dynamo__execute_delete", "Execute a PartiQL DELETE statement against DynamoDB. DESTRUCTIVE: permanently removes data.",
         DynamoExecuteDelete,
         dynamo_schema(&[("statement", "PartiQL DELETE statement", true)]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("dynamo__describe_table", "Describe a DynamoDB table schema: key schema, attribute definitions, indexes, and throughput.",
         DynamoDescribeTable,
         dynamo_schema(&[("table_name", "DynamoDB table name", true)]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("dynamo__list_tables", "List all DynamoDB table names in the connected account and region.",
         DynamoListTables,
         dynamo_schema(&[]),
         RiskLevel::Safe, "read", &["agent", "ui"]);
}
