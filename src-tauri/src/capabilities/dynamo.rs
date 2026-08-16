use std::sync::Arc;

use serde_json::Value;

use data_studio_agent::capabilities::registry::CapabilityRegistry;
use data_studio_agent::capabilities::types::{
    Capability, CapabilityHandler, RiskLevel, SourceKind,
};

use crate::dynamo::batch_get_item::{batch_get_item, BatchGetInput};
use crate::dynamo::batch_write_item::{batch_write_item, BatchWriteInput};
use crate::dynamo::cloudwatch_metrics::{get_table_metrics, CloudWatchInput};
use crate::dynamo::continuous_backups::describe_continuous_backups;
use crate::dynamo::create_backup::create_backup;
use crate::dynamo::create_item::{create_item, CreateItemInput};
use crate::dynamo::create_table::{create_table, CreateTableInput};
use crate::dynamo::delete_item::{delete_item, DeleteItemInput};
use crate::dynamo::delete_table::delete_table;
use crate::dynamo::describe_backup::describe_backup;
use crate::dynamo::describe_limits::describe_limits;
use crate::dynamo::list_backups::list_backups;
use crate::dynamo::list_tags::list_tags;
use crate::dynamo::query_table::{query_table, QueryTableInput};
use crate::dynamo::restore_table::{restore_table, RestoreTableInput};
use crate::dynamo::scan_table::{scan_table, ScanTableInput};
use crate::dynamo::tag_resource::tag_resource;
use crate::dynamo::time_to_live::describe_time_to_live;
use crate::dynamo::transact_write_items::{transact_write_items, TransactWriteInput};
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
// DynamoDB client factory traits (testable via mockall)
// ---------------------------------------------------------------------------

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub(crate) trait DynamoClientFactory: Send + Sync {
    async fn create_client(&self, config: &Value) -> Result<aws_sdk_dynamodb::Client, String>;
}

pub(crate) struct RealDynamoClientFactory;

#[async_trait::async_trait]
impl DynamoClientFactory for RealDynamoClientFactory {
    async fn create_client(&self, config: &Value) -> Result<aws_sdk_dynamodb::Client, String> {
        // TODO: Wire SSH tunnel resolution — needs AppHandle + connection_id
        crate::common::dynamo::create_dynamo_client(config, None).await
    }
}

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub(crate) trait CloudWatchClientFactory: Send + Sync {
    async fn create_client(&self, config: &Value) -> Result<aws_sdk_cloudwatch::Client, String>;
}

pub(crate) struct RealCloudWatchClientFactory;

#[async_trait::async_trait]
impl CloudWatchClientFactory for RealCloudWatchClientFactory {
    async fn create_client(&self, config: &Value) -> Result<aws_sdk_cloudwatch::Client, String> {
        // TODO: Wire SSH tunnel resolution — needs AppHandle + connection_id
        crate::common::dynamo::create_cloudwatch_client(config, None).await
    }
}

// ---------------------------------------------------------------------------
// DynamoDB capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct DynamoExecuteQuery {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoExecuteQuery {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteQuery {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args
            .get("statement")
            .and_then(|v| v.as_str())
            .ok_or("Missing statement")?;
        crate::common::validation::validate_dynamo_statement("dynamo__execute_query", statement)?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoExecuteWrite {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoExecuteWrite {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteWrite {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args
            .get("statement")
            .and_then(|v| v.as_str())
            .ok_or("Missing statement")?;
        crate::common::validation::validate_dynamo_statement("dynamo__execute_write", statement)?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoExecuteDelete {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoExecuteDelete {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoExecuteDelete {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let statement = args
            .get("statement")
            .and_then(|v| v.as_str())
            .ok_or("Missing statement")?;
        crate::common::validation::validate_dynamo_statement("dynamo__execute_delete", statement)?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoDescribeTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDescribeTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let response = crate::dynamo::describe_table::describe_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoListTables {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoListTables {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoListTables {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let client = self.factory.create_client(config).await?;
        let response = crate::dynamo::list_tables::list_tables(&client).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoQueryTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoQueryTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoQueryTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let mut payload = serde_json::Map::new();
        payload.insert(
            "table_name".to_string(),
            Value::String(table_name.to_string()),
        );
        if let Some(v) = args.get("partition_key") {
            payload.insert("partition_key".to_string(), v.clone());
        }
        if let Some(v) = args.get("sort_key") {
            payload.insert("sort_key".to_string(), v.clone());
        }
        if let Some(v) = args.get("index_name") {
            payload.insert("index_name".to_string(), v.clone());
        }
        if let Some(v) = args.get("filters") {
            payload.insert("filters".to_string(), v.clone());
        }
        payload.insert(
            "limit".to_string(),
            Value::from(args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10)),
        );
        if let Some(v) = args.get("exclusive_start_key") {
            payload.insert("exclusive_start_key".to_string(), v.clone());
        }
        let payload_value = Value::Object(payload);
        let input = QueryTableInput {
            table_name,
            payload: &payload_value,
        };
        let response = query_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoScanTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoScanTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoScanTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let payload = serde_json::json!({
            "table_name": table_name,
            "index_name": args.get("index_name"),
            "filters": args.get("filters"),
            "limit": args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10),
            "exclusive_start_key": args.get("exclusive_start_key"),
        });
        let input = ScanTableInput {
            table_name,
            payload: &payload,
        };
        let response = scan_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoCreateItem {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoCreateItem {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let payload = serde_json::json!({
            "attributes": args.get("attributes"),
            "skipExisting": args.get("skip_existing").and_then(|v| v.as_bool()).unwrap_or(false),
            "partitionKey": args.get("partition_key"),
        });
        let input = CreateItemInput {
            table_name,
            payload: &payload,
        };
        let response = create_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoBatchWriteItems {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoBatchWriteItems {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoBatchWriteItems {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let items = args
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let input = BatchWriteInput {
            table_name,
            items: &items,
        };
        let response = batch_write_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoBatchGetItems {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoBatchGetItems {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoBatchGetItems {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let request_items = args.get("request_items").ok_or("Missing request_items")?;
        let client = self.factory.create_client(config).await?;
        let input = BatchGetInput { request_items };
        let response = batch_get_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoUpdateItem {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdateItem {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let payload = serde_json::json!({
            "keys": args.get("keys"),
            "attributes": args.get("attributes"),
        });
        let input = UpdateItemInput {
            table_name,
            payload: &payload,
        };
        let response = update_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoDeleteItem {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDeleteItem {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteItem {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let payload = serde_json::json!({
            "keys": args.get("keys"),
        });
        let input = DeleteItemInput {
            table_name,
            payload: &payload,
        };
        let response = delete_item(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoTransactWriteItems {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoTransactWriteItems {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoTransactWriteItems {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let transact_items = args.get("transact_items").ok_or("Missing transact_items")?;
        let client = self.factory.create_client(config).await?;
        let input = TransactWriteInput { transact_items };
        let response = transact_write_items(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoCreateGsi {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoCreateGsi {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoUpdateGsi {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdateGsi {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoDeleteGsi {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDeleteGsi {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteGsi {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoDescribeContinuousBackups {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDescribeContinuousBackups {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeContinuousBackups {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let response = describe_continuous_backups(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoDescribeTtl {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDescribeTtl {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeTtl {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let response = describe_time_to_live(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoGetTableMetrics {
    cloudwatch_factory: Box<dyn CloudWatchClientFactory>,
}

impl DynamoGetTableMetrics {
    pub(crate) fn new() -> Self {
        Self {
            cloudwatch_factory: Box::new(RealCloudWatchClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn CloudWatchClientFactory>) -> Self {
        Self {
            cloudwatch_factory: factory,
        }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoGetTableMetrics {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let cloudwatch_client = self.cloudwatch_factory.create_client(config).await?;
        let period_hours = args
            .get("period_hours")
            .and_then(|v| v.as_i64())
            .unwrap_or(24);
        let input = CloudWatchInput {
            table_name,
            period_hours,
        };
        let response = get_table_metrics(&cloudwatch_client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoCreateTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoCreateTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
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

pub(crate) struct DynamoDeleteTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDeleteTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDeleteTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let response = delete_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoTruncateTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoTruncateTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoTruncateTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let response = truncate_table(&client, table_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoUpdateTableConfig {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdateTableConfig {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateTableConfig {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let billing_mode = args.get("billing_mode").and_then(|v| v.as_str());
        let read_capacity = args.get("read_capacity_units").and_then(|v| v.as_i64());
        let write_capacity = args.get("write_capacity_units").and_then(|v| v.as_i64());
        let table_class = args.get("table_class").and_then(|v| v.as_str());
        let response = update_table_config(
            &client,
            table_name,
            billing_mode,
            read_capacity,
            write_capacity,
            table_class,
        )
        .await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoUpdateTtl {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdateTtl {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateTtl {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let enabled = args
            .get("enabled")
            .and_then(|v| v.as_bool())
            .ok_or("Missing enabled")?;
        let attribute_name = args.get("attribute_name").and_then(|v| v.as_str());
        let response = update_time_to_live(&client, table_name, enabled, attribute_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoUpdatePitr {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdatePitr {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdatePitr {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let enabled = args
            .get("enabled")
            .and_then(|v| v.as_bool())
            .ok_or("Missing enabled")?;
        let response = update_continuous_backups(&client, table_name, enabled).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoUpdateStreams {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoUpdateStreams {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoUpdateStreams {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let client = self.factory.create_client(config).await?;
        let enabled = args
            .get("enabled")
            .and_then(|v| v.as_bool())
            .ok_or("Missing enabled")?;
        let stream_view_type = args.get("stream_view_type").and_then(|v| v.as_str());
        let response = update_streams(&client, table_name, enabled, stream_view_type).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

// ── Backup / restore / limits / tags (Wave 2A) ────────────────────────────

pub(crate) struct DynamoRestoreTable {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoRestoreTable {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoRestoreTable {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let source_table_name = args
            .get("source_table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing source_table_name")?;
        let target_table_name = args
            .get("target_table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing target_table_name")?;
        let client = self.factory.create_client(config).await?;
        let input = RestoreTableInput {
            source_table_name: source_table_name.to_string(),
            target_table_name: target_table_name.to_string(),
            payload: args.clone(),
        };
        let response = restore_table(&client, input).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoCreateBackup {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoCreateBackup {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoCreateBackup {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing table_name")?;
        let backup_name = args
            .get("backup_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing backup_name")?;
        let client = self.factory.create_client(config).await?;
        let response = create_backup(&client, table_name, backup_name).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoListBackups {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoListBackups {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoListBackups {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let table_name = args
            .get("table_name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let backup_type = args
            .get("backup_type")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let client = self.factory.create_client(config).await?;
        let response = list_backups(&client, table_name, backup_type).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoDescribeBackup {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDescribeBackup {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeBackup {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let backup_arn = args
            .get("backup_arn")
            .and_then(|v| v.as_str())
            .ok_or("Missing backup_arn")?;
        let client = self.factory.create_client(config).await?;
        let response = describe_backup(&client, backup_arn).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoDescribeLimits {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoDescribeLimits {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoDescribeLimits {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let client = self.factory.create_client(config).await?;
        let response = describe_limits(&client).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoListTags {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoListTags {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoListTags {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let resource_arn = args
            .get("resource_arn")
            .and_then(|v| v.as_str())
            .ok_or("Missing resource_arn")?;
        let client = self.factory.create_client(config).await?;
        let response = list_tags(&client, resource_arn).await?;
        serde_json::to_string(&response)
            .map(crate::common::format::truncate_tool_output)
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct DynamoTagResource {
    factory: Box<dyn DynamoClientFactory>,
}

impl DynamoTagResource {
    pub(crate) fn new() -> Self {
        Self {
            factory: Box::new(RealDynamoClientFactory),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn DynamoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for DynamoTagResource {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config =
            connection_config.ok_or_else(|| "DynamoDB requires a connection config".to_string())?;
        let resource_arn = args
            .get("resource_arn")
            .and_then(|v| v.as_str())
            .ok_or("Missing resource_arn")?;
        let tags_value = args.get("tags").ok_or("Missing tags")?;
        let tags_arr: Vec<Value> = match tags_value {
            Value::Array(items) => items.clone(),
            Value::String(s) => serde_json::from_str::<Vec<Value>>(s)
                .map_err(|e| format!("tags must be a valid JSON array: {}", e))?,
            _ => return Err("tags must be a JSON array of objects with key and value".to_string()),
        };
        let mut tags: Vec<aws_sdk_dynamodb::types::Tag> = Vec::new();
        for tag_value in tags_arr {
            let obj = tag_value
                .as_object()
                .ok_or("each tag must be a JSON object with key and value")?;
            let key = obj
                .get("key")
                .and_then(|v| v.as_str())
                .ok_or("each tag must have a 'key'")?;
            let value = obj
                .get("value")
                .and_then(|v| v.as_str())
                .ok_or("each tag must have a 'value'")?;
            tags.push(
                aws_sdk_dynamodb::types::Tag::builder()
                    .key(key)
                    .value(value)
                    .build()
                    .map_err(|e| format!("Failed to build tag: {}", e))?,
            );
        }
        if tags.is_empty() {
            return Err("tags must contain at least one tag".to_string());
        }
        let client = self.factory.create_client(config).await?;
        let response = tag_resource(&client, resource_arn, tags).await?;
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
            .chain(
                props
                    .iter()
                    .filter(|(_, _, r)| *r)
                    .map(|(n, _, _)| n.to_string()),
            )
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
                source_kind: SourceKind::Database("DYNAMODB"),
                tags: $tags,
                parallel_ok: $parallel_ok,
            });
        };
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr) => {
            reg!($name, $desc, $handler, $schema, $risk, $perm, $tags, false)
        };
    }

    reg!(
        "dynamo__execute_query",
        "Execute a PartiQL SELECT query against DynamoDB. Use for reading and querying table data.",
        DynamoExecuteQuery::new(),
        dynamo_schema(&[("statement", "PartiQL SELECT statement", true)]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"],
        true
    );

    reg!(
        "dynamo__execute_write",
        "Execute a PartiQL INSERT or UPDATE statement against DynamoDB.",
        DynamoExecuteWrite::new(),
        dynamo_schema(&[("statement", "PartiQL INSERT or UPDATE statement", true)]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"]
    );

    reg!("dynamo__execute_delete", "Execute a PartiQL DELETE statement against DynamoDB. DESTRUCTIVE: permanently removes data.",
         DynamoExecuteDelete::new(),
         dynamo_schema(&[("statement", "PartiQL DELETE statement", true)]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("dynamo__describe_table", "Describe a DynamoDB table schema and metadata: key schema, attribute definitions, provisioned throughput, billing mode, item count, table size, stream config, SSE status, table class, and index info. Returns GSI and LSI details (index names, types/status, key schema, projection, provisioned throughput, item count, size). Use this to look up index names before querying/scanning a GSI, check table status/health, verify throughput settings, or get table identifiers for further operations.",
         DynamoDescribeTable::new(),
         dynamo_schema(&[("table_name", "DynamoDB table name", true)]),
         RiskLevel::Safe, "read", &["agent", "ui"], true);

    reg!(
        "dynamo__list_tables",
        "List all DynamoDB table names in the connected account and region. First step for any DynamoDB task: list tables, then describe_table to inspect keys, then query_table. Report results in the user's language (中文/English).",
        DynamoListTables::new(),
        dynamo_schema(&[]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    // ── New capability handlers ────────────────────────────────────────────

    reg!(
        "dynamo__query_table",
        "Query a DynamoDB table using partition key, optional sort key, filters, and pagination. Use this whenever a task needs DynamoDB data — instead of shelling out to aws CLI. Report results in the user's language (中文/English).",
        DynamoQueryTable::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "partition_key",
                "JSON object with name and value for the partition key",
                true
            ),
            (
                "sort_key",
                "JSON object with name and value for the sort key",
                false
            ),
            ("index_name", "GSI or LSI index name to query", false),
            (
                "filters",
                "JSON array of filter objects with key, operator, and value",
                false
            ),
            (
                "limit",
                "Maximum number of items to return (integer, default 10)",
                false
            ),
            (
                "exclusive_start_key",
                "JSON object for pagination — the last evaluated key",
                false
            ),
        ]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__scan_table",
        "Scan a DynamoDB table with optional index, filters, and pagination.",
        DynamoScanTable::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            ("index_name", "GSI or LSI index name to scan", false),
            (
                "filters",
                "JSON array of filter objects with key, operator, and value",
                false
            ),
            (
                "limit",
                "Maximum number of items to return (integer, default 10)",
                false
            ),
            (
                "exclusive_start_key",
                "JSON object for pagination — the last evaluated key",
                false
            ),
        ]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__create_item",
        "Create a new item in a DynamoDB table.",
        DynamoCreateItem::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "attributes",
                "JSON array of attribute objects with key, value, and type",
                true
            ),
            (
                "skip_existing",
                "If true, skip item creation if it already exists",
                false
            ),
            (
                "partition_key",
                "Partition key attribute name (required when skip_existing is true)",
                false
            ),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__batch_write_items",
        "Batch write multiple items to a DynamoDB table (max 25 per call).",
        DynamoBatchWriteItems::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "items",
                "JSON array of items, each with attributes array containing key, value, and type",
                true
            ),
            (
                "skip_existing",
                "If true, skip items that already exist",
                false
            ),
            ("partition_key", "Partition key attribute name", false),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__batch_get_items",
        "Batch retrieve multiple items from one or more DynamoDB tables by primary key. Use this to efficiently fetch many items in a single request without scanning or querying each item individually. Example: request_items is a JSON object mapping table names to { keys: [{id: '123'}, {id: '456'}] }.",
        DynamoBatchGetItems::new(),
        dynamo_schema(&[
            (
                "request_items",
                "JSON object mapping table names to { keys: [ {attr: val, ...}, ...] }",
                true
            ),
        ]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__update_item",
        "Update attributes of an existing DynamoDB item.",
        DynamoUpdateItem::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "keys",
                "JSON array of key objects with key, value, and type",
                true
            ),
            (
                "attributes",
                "JSON array of attribute objects with key, value, and type to update",
                true
            ),
        ]),
        RiskLevel::Elevated,
        "update",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__delete_item",
        "Delete an item from a DynamoDB table by its keys.",
        DynamoDeleteItem::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "keys",
                "JSON array of key objects with key, value, and type",
                true
            ),
        ]),
        RiskLevel::Destructive,
        "delete",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__transact_write_items",
        "Execute multiple write operations (put, update, delete) in a single ACID transaction across one or more DynamoDB tables. All operations either succeed together or all roll back — ideal for maintaining data consistency across related items. Example: transact_items is a JSON array of objects each with op (put/update/delete), table_name, and operation-specific fields (attributes for put, keys+attributes for update, keys for delete).",
        DynamoTransactWriteItems::new(),
        dynamo_schema(&[
            (
                "transact_items",
                "JSON array of transact items, each with op, table_name, and operation-specific fields",
                true
            ),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"]
    );

    reg!("dynamo__create_gsi", "Create a global secondary index on a DynamoDB table.",
         DynamoCreateGsi::new(),
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
         RiskLevel::Elevated, "create", &["agent", "ui"]);

    reg!(
        "dynamo__update_gsi",
        "Update provisioned throughput for a global secondary index. Use when a DBA needs to resize an index's capacity to match changing access patterns: specify index_name plus new read_capacity_units and write_capacity_units (both required). Report results in the user's language (中文/English).",
        DynamoUpdateGsi::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            ("index_name", "Name of the GSI to update", true),
            (
                "read_capacity_units",
                "New provisioned read capacity units (integer)",
                true
            ),
            (
                "write_capacity_units",
                "New provisioned write capacity units (integer)",
                true
            ),
        ]),
        RiskLevel::Elevated,
        "update",
        &["agent", "ui"]
    );

    reg!("dynamo__delete_gsi", "Delete a global secondary index from a DynamoDB table. DESTRUCTIVE: permanently removes the index. Use when a DBA needs to remove an index that is no longer queried or was created by mistake — queries referencing it will fail afterwards. Confirm index_name before calling. Report results in the user's language (中文/English).",
         DynamoDeleteGsi::new(),
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("index_name", "Name of the GSI to delete", true),
         ]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("dynamo__describe_continuous_backups", "Describe the continuous backups and point-in-time recovery (PITR) settings for a DynamoDB table. Use when a DBA needs to audit backup protection status, confirm PITR is enabled, or check the earliest restorable time before planning a restore. Takes table_name. Report results in the user's language (中文/English).",
         DynamoDescribeContinuousBackups::new(),
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!(
        "dynamo__describe_ttl",
        "Describe the Time-To-Live (TTL) configuration for a DynamoDB table. Use when a DBA needs to check whether TTL is enabled and which attribute holds the expiry timestamp — before enabling, changing, or troubleshooting expiration. Takes table_name. Report results in the user's language (中文/English).",
        DynamoDescribeTtl::new(),
        dynamo_schema(&[("table_name", "DynamoDB table name", true),]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!("dynamo__get_table_metrics", "Get CloudWatch metrics for a DynamoDB table: consumed/provisioned capacity, throttling, and utilization. Use when a DBA needs to diagnose throttling, compare consumed vs provisioned capacity, or decide whether to switch billing modes. Optionally set period_hours (default 24). Report results in the user's language (中文/English).",
         DynamoGetTableMetrics::new(),
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("period_hours", "Time period in hours to fetch metrics for (integer, default 24)", false),
         ]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!(
        "dynamo__create_table",
        "Create a new DynamoDB table with key schema, indexes, billing, and stream configuration. Use when a DBA needs to provision a new table: specify partition_key (required), optional sort_key, billing_mode (PAY_PER_REQUEST default or PROVISIONED with capacity units), and optional global_secondary_indexes / local_secondary_indexes / stream_specification / sse_specification / tags. Report results in the user's language (中文/English).",
        DynamoCreateTable::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            ("partition_key", "Partition key attribute name", true),
            (
                "partition_key_type",
                "Partition key type: S, N, or B (default S)",
                false
            ),
            ("sort_key", "Sort key attribute name", false),
            (
                "sort_key_type",
                "Sort key type: S, N, or B (default S)",
                false
            ),
            (
                "billing_mode",
                "Billing mode: PAY_PER_REQUEST or PROVISIONED (default PAY_PER_REQUEST)",
                false
            ),
            (
                "read_capacity_units",
                "Provisioned read capacity (for PROVISIONED billing)",
                false
            ),
            (
                "write_capacity_units",
                "Provisioned write capacity (for PROVISIONED billing)",
                false
            ),
            (
                "global_secondary_indexes",
                "JSON array of GSI configurations",
                false
            ),
            (
                "local_secondary_indexes",
                "JSON array of LSI configurations (requires sort_key)",
                false
            ),
            (
                "stream_specification",
                "JSON object with stream_enabled and stream_view_type",
                false
            ),
            (
                "sse_specification",
                "JSON object with enabled, sse_type, and optional kms_master_key_id",
                false
            ),
            (
                "tags",
                "JSON array of tag objects with key and value",
                false
            ),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__delete_table",
        "Delete a DynamoDB table and all of its items. DESTRUCTIVE: cannot be undone. Use when a DBA needs to drop an obsolete or unused table. Confirm the table name before calling. Report results in the user's language (中文/English).",
        DynamoDeleteTable::new(),
        dynamo_schema(&[("table_name", "DynamoDB table name", true),]),
        RiskLevel::Destructive,
        "delete",
        &["agent", "ui"]
    );

    reg!("dynamo__truncate_table", "Delete all items from a DynamoDB table using batch writes. DESTRUCTIVE: removes all data but preserves the table. Use when a DBA needs to clear test or stale data while keeping the schema, keys, indexes, and settings intact — cheaper than drop-and-recreate. Confirm table_name before calling. Report results in the user's language (中文/English).",
         DynamoTruncateTable::new(),
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
         ]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!(
        "dynamo__update_table_config",
        "Update a DynamoDB table's billing mode, provisioned throughput, or table class. Use when a DBA needs to right-size capacity or optimize cost: set billing_mode (PAY_PER_REQUEST or PROVISIONED with read_capacity_units / write_capacity_units) and/or table_class (STANDARD or STANDARD_INFREQUENT_ACCESS). Report results in the user's language (中文/English).",
        DynamoUpdateTableConfig::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            (
                "billing_mode",
                "Billing mode: PAY_PER_REQUEST or PROVISIONED",
                false
            ),
            (
                "read_capacity_units",
                "Provisioned read capacity units (integer)",
                false
            ),
            (
                "write_capacity_units",
                "Provisioned write capacity units (integer)",
                false
            ),
            (
                "table_class",
                "Table class: STANDARD or STANDARD_INFREQUENT_ACCESS",
                false
            ),
        ]),
        RiskLevel::Elevated,
        "update",
        &["agent", "ui"]
    );

    reg!("dynamo__update_ttl", "Enable or disable Time-To-Live (TTL) on a DynamoDB table, optionally changing the TTL attribute. Use when a DBA needs to set up automatic expiration for stale records (e.g. session or log data): set enabled (required) and optionally attribute_name for the TTL timestamp field. Report results in the user's language (中文/English).",
         DynamoUpdateTtl::new(),
         dynamo_schema(&[
             ("table_name", "DynamoDB table name", true),
             ("enabled", "Whether TTL is enabled (boolean)", true),
             ("attribute_name", "Attribute name to use as TTL timestamp", false),
         ]),
         RiskLevel::Elevated, "update", &["agent", "ui"]);

    reg!(
        "dynamo__update_pitr",
        "Enable or disable Point-In-Time Recovery (PITR) on a DynamoDB table. Use when a DBA needs to protect against accidental deletes or writes and meet backup compliance: set enabled (required). PITR covers the last 35 days; restoring is a separate step (dynamo__restore_table). Report results in the user's language (中文/English).",
        DynamoUpdatePitr::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            ("enabled", "Whether PITR is enabled (boolean)", true),
        ]),
        RiskLevel::Elevated,
        "update",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__update_streams",
        "Enable or disable DynamoDB Streams on a table, with optional stream view type. Use when a DBA needs to feed change events to downstream consumers (Lambda, Kinesis, analytics): set enabled (required) and optionally stream_view_type (KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, or NEW_AND_OLD_IMAGES). Report results in the user's language (中文/English).",
        DynamoUpdateStreams::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name", true),
            ("enabled", "Whether streams are enabled (boolean)", true),
            (
                "stream_view_type",
                "Stream view type: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, or NEW_AND_OLD_IMAGES",
                false
            ),
        ]),
        RiskLevel::Elevated,
        "update",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__restore_table",
        "Restore a DynamoDB table from a backup or to a point in time. Provide source_backup_arn to restore from a specific backup, or source_table_name with use_latest_restorable_time/restore_date_time to restore to a point in time.",
        DynamoRestoreTable::new(),
        dynamo_schema(&[
            ("source_table_name", "Name of the source table to restore from (for point-in-time restore)", true),
            ("target_table_name", "Name of the new restored table", true),
            (
                "source_backup_arn",
                "ARN of the backup to restore from (alternative to point-in-time restore)",
                false
            ),
            (
                "use_latest_restorable_time",
                "Whether to restore to the latest restorable time (boolean, default true)",
                false
            ),
            (
                "restore_date_time",
                "ISO-8601 timestamp to restore to, e.g. 2026-01-01T00:00:00Z",
                false
            ),
            (
                "billing_mode_override",
                "Billing mode for the restored table: PAY_PER_REQUEST or PROVISIONED",
                false
            ),
            (
                "global_secondary_index_override",
                "JSON array of GSI overrides with index_name, key_schema, projection_type, and optional read/write_capacity_units",
                false
            ),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"],
        true
    );

    reg!(
        "dynamo__create_backup",
        "Create a backup of a DynamoDB table. Backups are stored in the on-demand backup system and can be used to restore the table later.",
        DynamoCreateBackup::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name to back up", true),
            ("backup_name", "Name for the new backup", true),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"],
        true
    );

    reg!(
        "dynamo__list_backups",
        "List the backups in the connected account and region, optionally filtered by table name or backup type (USER, SYSTEM, AWS_BACKUP, or ALL).",
        DynamoListBackups::new(),
        dynamo_schema(&[
            ("table_name", "DynamoDB table name to filter backups by", false),
            (
                "backup_type",
                "Backup type filter: USER, SYSTEM, AWS_BACKUP, or ALL",
                false
            ),
        ]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__describe_backup",
        "Describe the details of a specific DynamoDB backup, including its status, type, size, creation time, and the source table it was taken from.",
        DynamoDescribeBackup::new(),
        dynamo_schema(&[
            ("backup_arn", "ARN of the backup to describe", true),
        ]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__describe_limits",
        "Describe the maximum provisioned capacity limits for the connected account and region, both at the account level and per-table level.",
        DynamoDescribeLimits::new(),
        dynamo_schema(&[]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__list_tags",
        "List the tags attached to a DynamoDB resource (table, index, or backup).",
        DynamoListTags::new(),
        dynamo_schema(&[(
            "resource_arn",
            "ARN of the DynamoDB resource to list tags for",
            true
        ),]),
        RiskLevel::Safe,
        "read",
        &["agent", "ui"]
    );

    reg!(
        "dynamo__tag_resource",
        "Add or overwrite tags on a DynamoDB resource (table, index, or backup). Tags is a JSON array of objects each with a key and value.",
        DynamoTagResource::new(),
        dynamo_schema(&[
            ("resource_arn", "ARN of the DynamoDB resource to tag", true),
            (
                "tags",
                "JSON array of tag objects with key and value, e.g. [{\"key\": \"env\", \"value\": \"prod\"}]",
                true
            ),
        ]),
        RiskLevel::Elevated,
        "create",
        &["agent", "ui"],
        true
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Factory that always fails — used to verify error propagation paths
    /// where the handler should reach the factory call (i.e. arg extraction
    /// succeeded before the client is needed).
    struct FailingFactory;

    #[async_trait::async_trait]
    impl DynamoClientFactory for FailingFactory {
        async fn create_client(&self, _config: &Value) -> Result<aws_sdk_dynamodb::Client, String> {
            Err("factory failure".to_string())
        }
    }

    #[async_trait::async_trait]
    impl CloudWatchClientFactory for FailingFactory {
        async fn create_client(
            &self,
            _config: &Value,
        ) -> Result<aws_sdk_cloudwatch::Client, String> {
            Err("factory failure".to_string())
        }
    }

    /// Factory that returns a real SDK client backed by dummy credentials.
    /// Client construction performs no I/O, so module-level argument
    /// validation runs before any network call is attempted.
    struct TestDynamoFactory;

    #[async_trait::async_trait]
    impl DynamoClientFactory for TestDynamoFactory {
        async fn create_client(&self, _config: &Value) -> Result<aws_sdk_dynamodb::Client, String> {
            let config = json!({
                "region": "us-east-1",
                "accessKeyId": "test",
                "secretAccessKey": "test",
            });
            crate::common::dynamo::create_dynamo_client(&config, None).await
        }
    }

    // ── Missing connection config ──────────────────────────────────────────

    #[tokio::test]
    async fn test_execute_query_missing_config() {
        let handler = DynamoExecuteQuery::new();
        let result = handler
            .handle(&json!({"statement": "SELECT * FROM t"}), None)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_list_tables_missing_config() {
        let handler = DynamoListTables::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_describe_table_missing_config() {
        let handler = DynamoDescribeTable::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_query_table_missing_config() {
        let handler = DynamoQueryTable::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_scan_table_missing_config() {
        let handler = DynamoScanTable::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_batch_write_items_missing_config() {
        let handler = DynamoBatchWriteItems::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_batch_get_items_missing_config() {
        let handler = DynamoBatchGetItems::new();
        let result = handler
            .handle(&json!({"request_items": {"t": {"keys": []}}}), None)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_transact_write_items_missing_config() {
        let handler = DynamoTransactWriteItems::new();
        let result = handler.handle(&json!({"transact_items": []}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_update_gsi_missing_config() {
        let handler = DynamoUpdateGsi::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_delete_gsi_missing_config() {
        let handler = DynamoDeleteGsi::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_describe_continuous_backups_missing_config() {
        let handler = DynamoDescribeContinuousBackups::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_describe_ttl_missing_config() {
        let handler = DynamoDescribeTtl::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_get_table_metrics_missing_config() {
        let handler = DynamoGetTableMetrics::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_create_table_missing_config() {
        let handler = DynamoCreateTable::new();
        let result = handler.handle(&json!({"table_name": "t"}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    // ── Missing required args ──────────────────────────────────────────────
    //
    // The handlers check connection_config BEFORE args. We pass Some(empty
    // config) to pass the config gate and reach arg validation.

    #[tokio::test]
    async fn test_execute_query_missing_statement() {
        let handler = DynamoExecuteQuery::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing statement"));
    }

    #[tokio::test]
    async fn test_execute_write_missing_statement() {
        let handler = DynamoExecuteWrite::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing statement"));
    }

    #[tokio::test]
    async fn test_execute_delete_missing_statement() {
        let handler = DynamoExecuteDelete::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing statement"));
    }

    #[tokio::test]
    async fn test_describe_table_missing_table_name() {
        let handler = DynamoDescribeTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_query_table_missing_table_name() {
        let handler = DynamoQueryTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_create_item_missing_table_name() {
        let handler = DynamoCreateItem::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_update_item_missing_table_name() {
        let handler = DynamoUpdateItem::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_delete_item_missing_table_name() {
        let handler = DynamoDeleteItem::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_create_gsi_missing_table_name() {
        let handler = DynamoCreateGsi::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    // ── Factory error propagation ──────────────────────────────────────────

    #[tokio::test]
    async fn test_execute_query_factory_error() {
        let handler = DynamoExecuteQuery::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"statement": "SELECT * FROM t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_describe_table_factory_error() {
        let handler = DynamoDescribeTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_list_tables_factory_error() {
        let handler = DynamoListTables::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(&json!({}), Some(&json!({"region": "us-east-1"})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_delete_table_missing_table_name() {
        let handler = DynamoDeleteTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_truncate_table_missing_table_name() {
        let handler = DynamoTruncateTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_update_table_config_missing_table_name() {
        let handler = DynamoUpdateTableConfig::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_update_ttl_missing_table_name() {
        let handler = DynamoUpdateTtl::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_update_pitr_missing_table_name() {
        let handler = DynamoUpdatePitr::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_update_streams_missing_table_name() {
        let handler = DynamoUpdateStreams::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    // ── Missing required args (handlers from untested gap) ─────────────────

    #[tokio::test]
    async fn test_scan_table_missing_table_name() {
        let handler = DynamoScanTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_batch_write_items_missing_table_name() {
        let handler = DynamoBatchWriteItems::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_batch_get_items_missing_request_items() {
        let handler = DynamoBatchGetItems::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing request_items"));
    }

    #[tokio::test]
    async fn test_transact_write_items_missing_transact_items() {
        let handler = DynamoTransactWriteItems::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing transact_items"));
    }

    #[tokio::test]
    async fn test_update_gsi_missing_table_name() {
        let handler = DynamoUpdateGsi::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_delete_gsi_missing_table_name() {
        let handler = DynamoDeleteGsi::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_describe_continuous_backups_missing_table_name() {
        let handler = DynamoDescribeContinuousBackups::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_describe_ttl_missing_table_name() {
        let handler = DynamoDescribeTtl::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_get_table_metrics_missing_table_name() {
        let handler = DynamoGetTableMetrics::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    #[tokio::test]
    async fn test_create_table_missing_table_name() {
        let handler = DynamoCreateTable::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing table_name"));
    }

    // ── Factory error propagation ──────────────────────────────────────────

    #[tokio::test]
    async fn test_batch_write_items_factory_error() {
        let handler = DynamoBatchWriteItems::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t", "items": []}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_batch_get_items_factory_error() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"request_items": {"t": {"keys": []}}}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_transact_write_items_factory_error() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"transact_items": []}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    // ── Parameter format validation (module-level, before SDK call) ────────

    #[tokio::test]
    async fn test_batch_get_items_rejects_non_object_request_items() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"request_items": [{"t": {"keys": []}}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("request_items must be a JSON object"));
    }

    #[tokio::test]
    async fn test_batch_get_items_rejects_string_request_items() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(&json!({"request_items": "not-an-object"}), Some(&json!({})))
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("request_items must be a JSON object"));
    }

    #[tokio::test]
    async fn test_batch_get_items_rejects_table_without_keys() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(&json!({"request_items": {"t": {}}}), Some(&json!({})))
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'keys' array for table 't'"));
    }

    #[tokio::test]
    async fn test_transact_write_items_rejects_unknown_op() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "delete_range", "table_name": "t"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Unknown operation 'delete_range'"));
    }

    #[tokio::test]
    async fn test_transact_write_items_put_missing_attributes() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "put", "table_name": "t"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'attributes' array for 'put' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_items_delete_missing_keys() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "delete", "table_name": "t"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'keys' array for 'delete' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_items_empty_items() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(&json!({"transact_items": []}), Some(&json!({})))
            .await;
        assert!(result.is_ok());
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(
            data["data"]["consumed_capacity"].as_array().unwrap().len(),
            0
        );
    }

    #[tokio::test]
    async fn test_transact_write_items_missing_op() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"table_name": "t"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'op' field"));
    }

    #[tokio::test]
    async fn test_transact_write_items_missing_table_name() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "put"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'table_name'"));
    }

    #[tokio::test]
    async fn test_transact_write_items_update_missing_keys() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "update", "table_name": "t"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'keys' array for 'update'"));
    }

    #[tokio::test]
    async fn test_transact_write_items_update_missing_attributes() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "update", "table_name": "t", "keys": []}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'attributes' array for 'update'"));
    }

    #[tokio::test]
    async fn test_transact_write_items_put_sdk_error() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "put", "table_name": "t", "attributes": [{"key": "id", "value": "1", "type": "S"}]}]}),
                Some(&json!({})),
            )
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 500);
        assert!(data["message"]
            .as_str()
            .unwrap()
            .contains("Transaction failed"));
    }

    #[tokio::test]
    async fn test_transact_write_items_update_sdk_error() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "update", "table_name": "t", "keys": [{"key": "id", "value": "1", "type": "S"}], "attributes": [{"key": "name", "value": "test", "type": "S"}]}]}),
                Some(&json!({})),
            )
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 500);
        assert!(data["message"]
            .as_str()
            .unwrap()
            .contains("Transaction failed"));
    }

    #[tokio::test]
    async fn test_transact_write_items_delete_sdk_error() {
        let handler = DynamoTransactWriteItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"transact_items": [{"op": "delete", "table_name": "t", "keys": [{"key": "id", "value": "1", "type": "S"}]}]}),
                Some(&json!({})),
            )
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 500);
        assert!(data["message"]
            .as_str()
            .unwrap()
            .contains("Transaction failed"));
    }

    #[tokio::test]
    async fn test_batch_get_items_empty_request() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(&json!({"request_items": {}}), Some(&json!({})))
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 200);
        assert_eq!(data["data"]["responses"].as_object().unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_batch_get_items_all_empty_keys() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"request_items": {"t1": {"keys": []}, "t2": {"keys": []}}}),
                Some(&json!({})),
            )
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 200);
        assert_eq!(data["message"], "No valid keys provided");
    }

    #[tokio::test]
    async fn test_batch_get_items_sdk_error() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"request_items": {"t": {"keys": [{"id": "1"}]}}}),
                Some(&json!({})),
            )
            .await;
        let data: Value = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(data["status"], 500);
        assert!(data["message"]
            .as_str()
            .unwrap()
            .contains("Failed to batch get items"));
    }

    #[tokio::test]
    async fn test_batch_get_items_rejects_non_object_key() {
        let handler = DynamoBatchGetItems::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({"request_items": {"t": {"keys": ["not-an-object"]}}}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Each key must be a JSON object"));
    }

    #[tokio::test]
    async fn test_update_gsi_factory_error() {
        let handler = DynamoUpdateGsi::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_delete_gsi_factory_error() {
        let handler = DynamoDeleteGsi::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_describe_continuous_backups_factory_error() {
        let handler = DynamoDescribeContinuousBackups::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_describe_ttl_factory_error() {
        let handler = DynamoDescribeTtl::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_get_table_metrics_factory_error() {
        let handler = DynamoGetTableMetrics::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_create_table_factory_error() {
        let handler = DynamoCreateTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    // ── Additional factory error tests ─────────────────────────────────────

    #[tokio::test]
    async fn test_execute_write_factory_error() {
        let handler = DynamoExecuteWrite::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"statement": "INSERT INTO t VALUE {'pk': 'v'}"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_execute_delete_factory_error() {
        let handler = DynamoExecuteDelete::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"statement": "DELETE FROM t WHERE pk = 'v'"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_query_table_factory_error() {
        let handler = DynamoQueryTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t", "partition_key": {"name": "pk", "value": "v"}}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_scan_table_factory_error() {
        let handler = DynamoScanTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_create_item_factory_error() {
        let handler = DynamoCreateItem::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t", "attributes": []}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_update_item_factory_error() {
        let handler = DynamoUpdateItem::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_delete_item_factory_error() {
        let handler = DynamoDeleteItem::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_create_gsi_factory_error() {
        let handler = DynamoCreateGsi::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_delete_table_factory_error() {
        let handler = DynamoDeleteTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_truncate_table_factory_error() {
        let handler = DynamoTruncateTable::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_update_table_config_factory_error() {
        let handler = DynamoUpdateTableConfig::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_update_ttl_factory_error() {
        let handler = DynamoUpdateTtl::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_update_pitr_factory_error() {
        let handler = DynamoUpdatePitr::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_update_streams_factory_error() {
        let handler = DynamoUpdateStreams::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    // ── Wave 2A: restore / backup / limits / tags handlers ─────────────────

    #[tokio::test]
    async fn test_restore_table_missing_config() {
        let handler = DynamoRestoreTable::new();
        let result = handler
            .handle(
                &json!({"source_table_name": "src", "target_table_name": "dst"}),
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_restore_table_missing_source_table_name() {
        let handler = DynamoRestoreTable::new();
        let result = handler
            .handle(&json!({"target_table_name": "dst"}), Some(&json!({})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing source_table_name"));
    }

    #[tokio::test]
    async fn test_restore_table_missing_target_table_name() {
        let handler = DynamoRestoreTable::new();
        let result = handler
            .handle(&json!({"source_table_name": "src"}), Some(&json!({})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing target_table_name"));
    }

    #[tokio::test]
    async fn test_restore_table_rejects_invalid_restore_date_time() {
        let handler = DynamoRestoreTable::with_factory(Box::new(TestDynamoFactory));
        let result = handler
            .handle(
                &json!({
                    "source_table_name": "src",
                    "target_table_name": "dst",
                    "restore_date_time": "not-a-date"
                }),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("not a valid ISO-8601 timestamp"));
    }

    #[tokio::test]
    async fn test_create_backup_missing_config() {
        let handler = DynamoCreateBackup::new();
        let result = handler
            .handle(&json!({"table_name": "t", "backup_name": "b"}), None)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_create_backup_missing_backup_name() {
        let handler = DynamoCreateBackup::new();
        let result = handler
            .handle(&json!({"table_name": "t"}), Some(&json!({})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing backup_name"));
    }

    #[tokio::test]
    async fn test_list_backups_missing_config() {
        let handler = DynamoListBackups::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_describe_backup_missing_config() {
        let handler = DynamoDescribeBackup::new();
        let result = handler
            .handle(
                &json!({"backup_arn": "arn:aws:dynamodb:us-east-1:123:table/t/backup/xyz"}),
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_describe_backup_missing_backup_arn() {
        let handler = DynamoDescribeBackup::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing backup_arn"));
    }

    #[tokio::test]
    async fn test_describe_limits_missing_config() {
        let handler = DynamoDescribeLimits::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_list_tags_missing_config() {
        let handler = DynamoListTags::new();
        let result = handler
            .handle(
                &json!({"resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t"}),
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_list_tags_missing_resource_arn() {
        let handler = DynamoListTags::new();
        let result = handler.handle(&json!({}), Some(&json!({}))).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing resource_arn"));
    }

    #[tokio::test]
    async fn test_tag_resource_missing_config() {
        let handler = DynamoTagResource::new();
        let result = handler
            .handle(
                &json!({
                    "resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t",
                    "tags": [{"key": "a", "value": "b"}]
                }),
                None,
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_tag_resource_missing_resource_arn() {
        let handler = DynamoTagResource::new();
        let result = handler
            .handle(
                &json!({"tags": [{"key": "a", "value": "b"}]}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing resource_arn"));
    }

    #[tokio::test]
    async fn test_tag_resource_missing_tags() {
        let handler = DynamoTagResource::new();
        let result = handler
            .handle(
                &json!({"resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t"}),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing tags"));
    }

    #[tokio::test]
    async fn test_tag_resource_rejects_empty_tags() {
        let handler = DynamoTagResource::new();
        let result = handler
            .handle(
                &json!({
                    "resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t",
                    "tags": []
                }),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("at least one tag"));
    }

    #[tokio::test]
    async fn test_tag_resource_rejects_invalid_tags_json() {
        let handler = DynamoTagResource::new();
        let result = handler
            .handle(
                &json!({
                    "resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t",
                    "tags": "not-json"
                }),
                Some(&json!({})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("valid JSON array"));
    }

    // ── Wave 2A: factory error propagation ─────────────────────────────────

    #[tokio::test]
    async fn test_create_backup_factory_error() {
        let handler = DynamoCreateBackup::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"table_name": "t", "backup_name": "b"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_list_backups_factory_error() {
        let handler = DynamoListBackups::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(&json!({}), Some(&json!({"region": "us-east-1"})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_describe_backup_factory_error() {
        let handler = DynamoDescribeBackup::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"backup_arn": "arn:aws:dynamodb:us-east-1:123:table/t/backup/xyz"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_describe_limits_factory_error() {
        let handler = DynamoDescribeLimits::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(&json!({}), Some(&json!({"region": "us-east-1"})))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_list_tags_factory_error() {
        let handler = DynamoListTags::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({"resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t"}),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    #[tokio::test]
    async fn test_tag_resource_factory_error() {
        let handler = DynamoTagResource::with_factory(Box::new(FailingFactory));
        let result = handler
            .handle(
                &json!({
                    "resource_arn": "arn:aws:dynamodb:us-east-1:123:table/t",
                    "tags": [{"key": "a", "value": "b"}]
                }),
                Some(&json!({"region": "us-east-1"})),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory failure"));
    }

    // ── register_all / agent exposure ───────────────────────────────────────

    #[tokio::test]
    async fn test_all_dynamo_capabilities_are_agent_tagged() {
        use data_studio_agent::capabilities::registry::CapabilityRegistry;

        let mut reg = CapabilityRegistry::new();
        super::register_all(&mut reg);

        let all_agent = reg.agent_tools();
        let dynamo_agent: Vec<_> = all_agent
            .iter()
            .filter(|c| c.name.starts_with("dynamo__"))
            .collect();
        assert_eq!(
            dynamo_agent.len(),
            33,
            "expected all 33 DynamoDB capabilities tagged for agent"
        );
    }
}
