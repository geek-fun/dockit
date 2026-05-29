use std::sync::Arc;

use serde_json::Value;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

use crate::dynamo::batch_write_item::{batch_write_item, BatchWriteInput};
use crate::dynamo::cloudwatch_metrics::{get_table_metrics, CloudWatchInput};
use crate::dynamo::continuous_backups::describe_continuous_backups;
use crate::dynamo::create_item::{create_item, CreateItemInput};
use crate::dynamo::create_table::{create_table, CreateTableInput};
use crate::dynamo::delete_item::{delete_item, DeleteItemInput};
use crate::dynamo::delete_table::delete_table;
use crate::dynamo::query_table::{query_table, QueryTableInput};
use crate::dynamo::scan_table::{scan_table, ScanTableInput};
use crate::dynamo::time_to_live::describe_time_to_live;
use crate::dynamo::truncate_table::truncate_table;
use crate::dynamo::update_item::{update_item, UpdateItemInput};
use crate::dynamo::update_pitr::update_continuous_backups;
use crate::dynamo::update_streams::update_streams;
use crate::dynamo::update_table::{
    create_global_secondary_index, delete_global_secondary_index, update_global_secondary_index,
    CreateGsiInput, DeleteGsiInput, UpdateGsiInput,
};
use crate::dynamo::update_table_config::update_table_config;
use crate::dynamo::update_ttl::update_time_to_live;

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
        crate::common::validation::validate_dynamo_statement("dynamo__execute_query", statement)?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
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
        crate::common::validation::validate_dynamo_statement("dynamo__execute_write", statement)?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
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
        crate::common::validation::validate_dynamo_statement("dynamo__execute_delete", statement)?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let input = crate::dynamo::execute_statement::ExecuteStatementInput {
            statement,
            next_token: None,
            limit: None,
        };
        let response = crate::dynamo::execute_statement::execute_statement(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
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
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = crate::dynamo::describe_table::describe_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
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
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = crate::dynamo::list_tables::list_tables(&client).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoQueryTable;
pub(crate) struct DynamoScanTable;
pub(crate) struct DynamoCreateItem;
pub(crate) struct DynamoBatchWriteItems;
pub(crate) struct DynamoUpdateItem;
pub(crate) struct DynamoDeleteItem;
pub(crate) struct DynamoCreateGsi;
pub(crate) struct DynamoUpdateGsi;
pub(crate) struct DynamoDeleteGsi;
pub(crate) struct DynamoDescribeContinuousBackups;
pub(crate) struct DynamoDescribeTtl;
pub(crate) struct DynamoGetTableMetrics;
pub(crate) struct DynamoCreateTable;
pub(crate) struct DynamoDeleteTable;
pub(crate) struct DynamoTruncateTable;
pub(crate) struct DynamoUpdateTableConfig;
pub(crate) struct DynamoUpdateTtl;
pub(crate) struct DynamoUpdatePitr;
pub(crate) struct DynamoUpdateStreams;

#[async_trait::async_trait]
impl CapabilityHandler for DynamoQueryTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "table_name": table_name,
            "partition_key": args.get("partition_key"),
            "sort_key": args.get("sort_key"),
            "index_name": args.get("index_name"),
            "filters": args.get("filters"),
            "limit": args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10),
            "exclusive_start_key": args.get("exclusive_start_key"),
        });
        let input = QueryTableInput { table_name, payload: &payload };
        let response = query_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoScanTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "table_name": table_name,
            "index_name": args.get("index_name"),
            "filters": args.get("filters"),
            "limit": args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10),
            "exclusive_start_key": args.get("exclusive_start_key"),
        });
        let input = ScanTableInput { table_name, payload: &payload };
        let response = scan_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "attributes": args.get("attributes"),
            "skipExisting": args.get("skip_existing").and_then(|v| v.as_bool()).unwrap_or(false),
            "partitionKey": args.get("partition_key"),
        });
        let input = CreateItemInput { table_name, payload: &payload };
        let response = create_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoBatchWriteItems {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let items = args.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let input = BatchWriteInput { table_name, items: &items };
        let response = batch_write_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "keys": args.get("keys"),
            "attributes": args.get("attributes"),
        });
        let input = UpdateItemInput { table_name, payload: &payload };
        let response = update_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "keys": args.get("keys"),
        });
        let input = DeleteItemInput { table_name, payload: &payload };
        let response = delete_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "index_name": args.get("index_name"),
            "key_schema": args.get("key_schema"),
            "projection_type": args.get("projection_type"),
            "projected_attributes": args.get("projected_attributes"),
            "read_capacity_units": args.get("read_capacity_units").and_then(|v| v.as_i64()),
            "write_capacity_units": args.get("write_capacity_units").and_then(|v| v.as_i64()),
            "warm_throughput": args.get("warm_throughput"),
        });
        let input = CreateGsiInput {
            table_name: table_name.to_string(),
            payload,
        };
        let response = create_global_secondary_index(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "index_name": args.get("index_name"),
            "read_capacity_units": args.get("read_capacity_units").and_then(|v| v.as_i64()),
            "write_capacity_units": args.get("write_capacity_units").and_then(|v| v.as_i64()),
        });
        let input = UpdateGsiInput {
            table_name: table_name.to_string(),
            payload,
        };
        let response = update_global_secondary_index(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let payload = serde_json::json!({
            "index_name": args.get("index_name"),
        });
        let input = DeleteGsiInput {
            table_name: table_name.to_string(),
            payload,
        };
        let response = delete_global_secondary_index(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeContinuousBackups {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = describe_continuous_backups(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeTtl {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = describe_time_to_live(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoGetTableMetrics {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let cloudwatch_client = crate::common::dynamo::create_cloudwatch_client(config).await?;
        let period_hours = args.get("period_hours").and_then(|v| v.as_i64()).unwrap_or(24);
        let input = CloudWatchInput { table_name, period_hours };
        let response = get_table_metrics(&cloudwatch_client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        // Pass the entire args as the payload — create_table reads all fields from it
        let input = CreateTableInput {
            table_name: table_name.to_string(),
            payload: args.clone(),
        };
        let response = create_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = delete_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoTruncateTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let response = truncate_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateTableConfig {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let billing_mode = args.get("billing_mode").and_then(|v| v.as_str());
        let read_capacity = args.get("read_capacity_units").and_then(|v| v.as_i64());
        let write_capacity = args.get("write_capacity_units").and_then(|v| v.as_i64());
        let table_class = args.get("table_class").and_then(|v| v.as_str());
        let response = update_table_config(&client, table_name, billing_mode, read_capacity, write_capacity, table_class).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateTtl {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let enabled = args.get("enabled").and_then(|v| v.as_bool()).ok_or("Missing enabled")?;
        let attribute_name = args.get("attribute_name").and_then(|v| v.as_str());
        let response = update_time_to_live(&client, table_name, enabled, attribute_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdatePitr {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let enabled = args.get("enabled").and_then(|v| v.as_bool()).ok_or("Missing enabled")?;
        let response = update_continuous_backups(&client, table_name, enabled).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateStreams {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args.get("table_name").and_then(|v| v.as_str()).ok_or("Missing table_name")?;
        let client = crate::common::dynamo::create_dynamo_client(config).await?;
        let enabled = args.get("enabled").and_then(|v| v.as_bool()).ok_or("Missing enabled")?;
        let stream_view_type = args.get("stream_view_type").and_then(|v| v.as_str());
        let response = update_streams(&client, table_name, enabled, stream_view_type).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
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

    // ── New capability handlers ────────────────────────────────────────────

    reg!("dynamo__query_table", "Query a DynamoDB table using partition key, optional sort key, filters, and pagination.",
         DynamoQueryTable,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("partition_key", "JSON object with name and value for the partition key", true),
             ("sort_key", "JSON object with name and value for the sort key", false),
             ("index_name", "GSI or LSI index name to query", false),
             ("filters", "JSON array of filter objects with key, operator, and value", false),
             ("limit", "Maximum number of items to return (integer, default 10)", false),
             ("exclusive_start_key", "JSON object for pagination — the last evaluated key", false),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("dynamo__scan_table", "Scan a DynamoDB table with optional index, filters, and pagination.",
         DynamoScanTable,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("index_name", "GSI or LSI index name to scan", false),
             ("filters", "JSON array of filter objects with key, operator, and value", false),
             ("limit", "Maximum number of items to return (integer, default 10)", false),
             ("exclusive_start_key", "JSON object for pagination — the last evaluated key", false),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("dynamo__create_item", "Create a new item in a DynamoDB table.",
         DynamoCreateItem,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("attributes", "JSON array of attribute objects with key, value, and type", true),
             ("skip_existing", "If true, skip item creation if it already exists", false),
             ("partition_key", "Partition key attribute name (required when skip_existing is true)", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("dynamo__batch_write_items", "Batch write multiple items to a DynamoDB table (max 25 per call).",
         DynamoBatchWriteItems,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("items", "JSON array of items, each with attributes array containing key, value, and type", true),
             ("skip_existing", "If true, skip items that already exist", false),
             ("partition_key", "Partition key attribute name", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("dynamo__update_item", "Update attributes of an existing DynamoDB item.",
         DynamoUpdateItem,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("keys", "JSON array of key objects with key, value, and type", true),
             ("attributes", "JSON array of attribute objects with key, value, and type to update", true),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("dynamo__delete_item", "Delete an item from a DynamoDB table by its keys.",
         DynamoDeleteItem,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("keys", "JSON array of key objects with key, value, and type", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("dynamo__create_gsi", "Create a global secondary index on a DynamoDB table.",
         DynamoCreateGsi,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("index_name", "Name for the new GSI", true),
             ("key_schema", "JSON array of key schema objects with attribute_name, key_type (HASH/RANGE), and attribute_type (S/N/B)", true),
             ("projection_type", "Projection type: ALL, KEYS_ONLY, or INCLUDE", true),
             ("projected_attributes", "JSON array of attribute names to project (required when projection_type is INCLUDE)", false),
             ("read_capacity_units", "Provisioned read capacity units (integer, for provisioned billing)", false),
             ("write_capacity_units", "Provisioned write capacity units (integer, for provisioned billing)", false),
             ("warm_throughput", "JSON object with read_units_per_second and write_units_per_second", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("dynamo__update_gsi", "Update provisioned throughput for a global secondary index.",
         DynamoUpdateGsi,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("index_name", "Name of the GSI to update", true),
             ("read_capacity_units", "New provisioned read capacity units (integer)", true),
             ("write_capacity_units", "New provisioned write capacity units (integer)", true),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("dynamo__delete_gsi", "Delete a global secondary index from a DynamoDB table. DESTRUCTIVE: permanently removes the index.",
         DynamoDeleteGsi,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("index_name", "Name of the GSI to delete", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("dynamo__describe_continuous_backups", "Describe the continuous backups and point-in-time recovery (PITR) settings for a DynamoDB table.",
         DynamoDescribeContinuousBackups,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("dynamo__describe_ttl", "Describe the Time-To-Live (TTL) configuration for a DynamoDB table.",
         DynamoDescribeTtl,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("dynamo__get_table_metrics", "Get CloudWatch metrics for a DynamoDB table: consumed/provisioned capacity, throttling, and utilization.",
         DynamoGetTableMetrics,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("period_hours", "Time period in hours to fetch metrics for (integer, default 24)", false),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("dynamo__create_table", "Create a new DynamoDB table with key schema, indexes, billing, and stream configuration.",
         DynamoCreateTable,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("partition_key", "Partition key attribute name", true),
             ("partition_key_type", "Partition key type: S, N, or B (default S)", false),
             ("sort_key", "Sort key attribute name", false),
             ("sort_key_type", "Sort key type: S, N, or B (default S)", false),
             ("billing_mode", "Billing mode: PAY_PER_REQUEST or PROVISIONED (default PAY_PER_REQUEST)", false),
             ("read_capacity_units", "Provisioned read capacity (for PROVISIONED billing)", false),
             ("write_capacity_units", "Provisioned write capacity (for PROVISIONED billing)", false),
             ("global_secondary_indexes", "JSON array of GSI configurations", false),
             ("local_secondary_indexes", "JSON array of LSI configurations (requires sort_key)", false),
             ("stream_specification", "JSON object with stream_enabled and stream_view_type", false),
             ("sse_specification", "JSON object with enabled, sse_type, and optional kms_master_key_id", false),
             ("tags", "JSON array of tag objects with key and value", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("dynamo__delete_table", "Delete a DynamoDB table and all of its items. DESTRUCTIVE: cannot be undone.",
         DynamoDeleteTable,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("dynamo__truncate_table", "Delete all items from a DynamoDB table using batch writes. DESTRUCTIVE: removes all data but preserves the table.",
         DynamoTruncateTable,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("dynamo__update_table_config", "Update a DynamoDB table's billing mode, provisioned throughput, or table class.",
         DynamoUpdateTableConfig,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("billing_mode", "Billing mode: PAY_PER_REQUEST or PROVISIONED", false),
             ("read_capacity_units", "Provisioned read capacity units (integer)", false),
             ("write_capacity_units", "Provisioned write capacity units (integer)", false),
             ("table_class", "Table class: STANDARD or STANDARD_INFREQUENT_ACCESS", false),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("dynamo__update_ttl", "Enable or disable Time-To-Live (TTL) on a DynamoDB table, optionally changing the TTL attribute.",
         DynamoUpdateTtl,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("enabled", "Whether TTL is enabled (boolean)", true),
             ("attribute_name", "Attribute name to use as TTL timestamp", false),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("dynamo__update_pitr", "Enable or disable Point-In-Time Recovery (PITR) on a DynamoDB table.",
         DynamoUpdatePitr,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("enabled", "Whether PITR is enabled (boolean)", true),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("dynamo__update_streams", "Enable or disable DynamoDB Streams on a table, with optional stream view type.",
         DynamoUpdateStreams,
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("enabled", "Whether streams are enabled (boolean)", true),
             ("stream_view_type", "Stream view type: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, or NEW_AND_OLD_IMAGES", false),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);
}
