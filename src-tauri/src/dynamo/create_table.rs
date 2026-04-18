use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::{
    AttributeDefinition, BillingMode, KeySchemaElement, KeyType, ProvisionedThroughput,
    ScalarAttributeType,
};
use aws_sdk_dynamodb::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct CreateTableInput {
    pub table_name: String,
    pub payload: serde_json::Value,
}

fn parse_scalar_type(type_str: &str) -> ScalarAttributeType {
    match type_str.to_uppercase().as_str() {
        "S" => ScalarAttributeType::S,
        "N" => ScalarAttributeType::N,
        "B" => ScalarAttributeType::B,
        _ => ScalarAttributeType::S,
    }
}

pub async fn create_table(client: &Client, input: CreateTableInput) -> Result<ApiResponse, String> {
    let payload = &input.payload;

    let table_name = payload
        .get("table_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&input.table_name);

    let partition_key = payload
        .get("partition_key")
        .and_then(|v| v.as_str())
        .ok_or("partition_key is required")?;

    let partition_key_type = payload
        .get("partition_key_type")
        .and_then(|v| v.as_str())
        .unwrap_or("S");

    let billing_mode_str = payload
        .get("billing_mode")
        .and_then(|v| v.as_str())
        .unwrap_or("PAY_PER_REQUEST");

    let billing_mode = match billing_mode_str.to_uppercase().as_str() {
        "PROVISIONED" => BillingMode::Provisioned,
        _ => BillingMode::PayPerRequest,
    };

    let mut key_schema = vec![KeySchemaElement::builder()
        .attribute_name(partition_key)
        .key_type(KeyType::Hash)
        .build()
        .map_err(|e| format!("Failed to build partition key schema: {}", e))?];

    let mut attribute_definitions = vec![AttributeDefinition::builder()
        .attribute_name(partition_key)
        .attribute_type(parse_scalar_type(partition_key_type))
        .build()
        .map_err(|e| format!("Failed to build partition key definition: {}", e))?];

    if let Some(sort_key) = payload.get("sort_key").and_then(|v| v.as_str()) {
        if !sort_key.is_empty() {
            let sort_key_type = payload
                .get("sort_key_type")
                .and_then(|v| v.as_str())
                .unwrap_or("S");

            key_schema.push(
                KeySchemaElement::builder()
                    .attribute_name(sort_key)
                    .key_type(KeyType::Range)
                    .build()
                    .map_err(|e| format!("Failed to build sort key schema: {}", e))?,
            );

            attribute_definitions.push(
                AttributeDefinition::builder()
                    .attribute_name(sort_key)
                    .attribute_type(parse_scalar_type(sort_key_type))
                    .build()
                    .map_err(|e| format!("Failed to build sort key definition: {}", e))?,
            );
        }
    }

    let mut request = client
        .create_table()
        .table_name(table_name)
        .set_key_schema(Some(key_schema))
        .set_attribute_definitions(Some(attribute_definitions))
        .billing_mode(billing_mode.clone());

    if billing_mode == BillingMode::Provisioned {
        let read_capacity = payload
            .get("read_capacity_units")
            .and_then(|v| v.as_i64())
            .unwrap_or(5);
        let write_capacity = payload
            .get("write_capacity_units")
            .and_then(|v| v.as_i64())
            .unwrap_or(5);

        let throughput = ProvisionedThroughput::builder()
            .read_capacity_units(read_capacity)
            .write_capacity_units(write_capacity)
            .build()
            .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;

        request = request.provisioned_throughput(throughput);
    }

    match request.send().await {
        Ok(response) => {
            let table_name_result = response
                .table_description()
                .and_then(|t| t.table_name())
                .unwrap_or(table_name);
            Ok(ApiResponse {
                status: 200,
                message: format!("Table '{}' created successfully", table_name_result),
                data: Some(json!({
                    "tableName": table_name_result,
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to create table: {}", e),
            data: None,
        }),
    }
}
