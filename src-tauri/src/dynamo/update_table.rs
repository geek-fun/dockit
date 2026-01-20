use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::{
    AttributeDefinition, CreateGlobalSecondaryIndexAction, DeleteGlobalSecondaryIndexAction,
    GlobalSecondaryIndexUpdate, KeySchemaElement, KeyType, Projection, ProjectionType,
    ProvisionedThroughput, ScalarAttributeType, UpdateGlobalSecondaryIndexAction,
};
use aws_sdk_dynamodb::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct CreateGsiInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGsiInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct DeleteGsiInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a serde_json::Value,
}

fn parse_scalar_type(type_str: &str) -> ScalarAttributeType {
    match type_str.to_uppercase().as_str() {
        "S" => ScalarAttributeType::S,
        "N" => ScalarAttributeType::N,
        "B" => ScalarAttributeType::B,
        _ => ScalarAttributeType::S,
    }
}

fn parse_projection_type(type_str: &str) -> ProjectionType {
    match type_str.to_uppercase().as_str() {
        "ALL" => ProjectionType::All,
        "KEYS_ONLY" => ProjectionType::KeysOnly,
        "INCLUDE" => ProjectionType::Include,
        _ => ProjectionType::All,
    }
}

pub async fn create_global_secondary_index(
    client: &Client,
    input: CreateGsiInput<'_>,
) -> Result<ApiResponse, String> {
    let payload = input.payload;

    // Extract index configuration from payload
    let index_name = payload
        .get("index_name")
        .and_then(|v| v.as_str())
        .ok_or("index_name is required")?;

    let partition_key_name = payload
        .get("partition_key")
        .and_then(|v| v.as_str())
        .ok_or("partition_key is required")?;

    let partition_key_type = payload
        .get("partition_key_type")
        .and_then(|v| v.as_str())
        .unwrap_or("S");

    let sort_key_name = payload.get("sort_key").and_then(|v| v.as_str());
    let sort_key_type = payload
        .get("sort_key_type")
        .and_then(|v| v.as_str())
        .unwrap_or("S");

    let projection_type = payload
        .get("projection_type")
        .and_then(|v| v.as_str())
        .unwrap_or("ALL");

    let read_capacity = payload
        .get("read_capacity_units")
        .and_then(|v| v.as_i64())
        .unwrap_or(5) as i64;

    let write_capacity = payload
        .get("write_capacity_units")
        .and_then(|v| v.as_i64())
        .unwrap_or(5) as i64;

    // Build key schema
    let mut key_schema = vec![KeySchemaElement::builder()
        .attribute_name(partition_key_name)
        .key_type(KeyType::Hash)
        .build()
        .map_err(|e| format!("Failed to build partition key schema: {}", e))?];

    if let Some(sk_name) = sort_key_name {
        if !sk_name.is_empty() {
            key_schema.push(
                KeySchemaElement::builder()
                    .attribute_name(sk_name)
                    .key_type(KeyType::Range)
                    .build()
                    .map_err(|e| format!("Failed to build sort key schema: {}", e))?,
            );
        }
    }

    // Build projection
    let mut projection_builder = Projection::builder().projection_type(parse_projection_type(projection_type));

    if projection_type.to_uppercase() == "INCLUDE" {
        if let Some(attrs) = payload.get("projected_attributes").and_then(|v| v.as_array()) {
            for attr in attrs {
                if let Some(attr_str) = attr.as_str() {
                    projection_builder = projection_builder.non_key_attributes(attr_str);
                }
            }
        }
    }

    let projection = projection_builder.build();

    // Build provisioned throughput
    let provisioned_throughput = ProvisionedThroughput::builder()
        .read_capacity_units(read_capacity)
        .write_capacity_units(write_capacity)
        .build()
        .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;

    // Build the GSI create action
    let create_gsi_action = CreateGlobalSecondaryIndexAction::builder()
        .index_name(index_name)
        .set_key_schema(Some(key_schema))
        .projection(projection)
        .provisioned_throughput(provisioned_throughput)
        .build()
        .map_err(|e| format!("Failed to build GSI create action: {}", e))?;

    let gsi_update = GlobalSecondaryIndexUpdate::builder()
        .create(create_gsi_action)
        .build();

    // Build attribute definitions for the new keys
    let mut attribute_definitions = vec![AttributeDefinition::builder()
        .attribute_name(partition_key_name)
        .attribute_type(parse_scalar_type(partition_key_type))
        .build()
        .map_err(|e| format!("Failed to build attribute definition: {}", e))?];

    if let Some(sk_name) = sort_key_name {
        if !sk_name.is_empty() {
            attribute_definitions.push(
                AttributeDefinition::builder()
                    .attribute_name(sk_name)
                    .attribute_type(parse_scalar_type(sort_key_type))
                    .build()
                    .map_err(|e| format!("Failed to build sort key attribute definition: {}", e))?,
            );
        }
    }

    // Execute the update table request
    match client
        .update_table()
        .table_name(input.table_name)
        .global_secondary_index_updates(gsi_update)
        .set_attribute_definitions(Some(attribute_definitions))
        .send()
        .await
    {
        Ok(response) => {
            let table_description = response.table_description();
            Ok(ApiResponse {
                status: 200,
                message: format!("GSI '{}' creation initiated successfully", index_name),
                data: Some(json!({
                    "indexName": index_name,
                    "indexType": "GSI",
                    "tableStatus": table_description.and_then(|t| t.table_status().map(|s| s.as_str().to_string()))
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to create GSI: {}", e),
            data: None,
        }),
    }
}

pub async fn update_global_secondary_index(
    client: &Client,
    input: UpdateGsiInput<'_>,
) -> Result<ApiResponse, String> {
    let payload = input.payload;

    let index_name = payload
        .get("index_name")
        .and_then(|v| v.as_str())
        .ok_or("index_name is required")?;

    let read_capacity = payload
        .get("read_capacity_units")
        .and_then(|v| v.as_i64())
        .ok_or("read_capacity_units is required")? as i64;

    let write_capacity = payload
        .get("write_capacity_units")
        .and_then(|v| v.as_i64())
        .ok_or("write_capacity_units is required")? as i64;

    // Build provisioned throughput
    let provisioned_throughput = ProvisionedThroughput::builder()
        .read_capacity_units(read_capacity)
        .write_capacity_units(write_capacity)
        .build()
        .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;

    // Build the GSI update action
    let update_gsi_action = UpdateGlobalSecondaryIndexAction::builder()
        .index_name(index_name)
        .provisioned_throughput(provisioned_throughput)
        .build()
        .map_err(|e| format!("Failed to build GSI update action: {}", e))?;

    let gsi_update = GlobalSecondaryIndexUpdate::builder()
        .update(update_gsi_action)
        .build();

    // Execute the update table request
    match client
        .update_table()
        .table_name(input.table_name)
        .global_secondary_index_updates(gsi_update)
        .send()
        .await
    {
        Ok(response) => {
            let table_description = response.table_description();
            Ok(ApiResponse {
                status: 200,
                message: format!("GSI '{}' update initiated successfully", index_name),
                data: Some(json!({
                    "indexName": index_name,
                    "indexType": "GSI",
                    "tableStatus": table_description.and_then(|t| t.table_status().map(|s| s.as_str().to_string()))
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to update GSI: {}", e),
            data: None,
        }),
    }
}

pub async fn delete_global_secondary_index(
    client: &Client,
    input: DeleteGsiInput<'_>,
) -> Result<ApiResponse, String> {
    let payload = input.payload;

    let index_name = payload
        .get("index_name")
        .and_then(|v| v.as_str())
        .ok_or("index_name is required")?;

    // Build the GSI delete action
    let delete_gsi_action = DeleteGlobalSecondaryIndexAction::builder()
        .index_name(index_name)
        .build()
        .map_err(|e| format!("Failed to build GSI delete action: {}", e))?;

    let gsi_update = GlobalSecondaryIndexUpdate::builder()
        .delete(delete_gsi_action)
        .build();

    // Execute the update table request
    match client
        .update_table()
        .table_name(input.table_name)
        .global_secondary_index_updates(gsi_update)
        .send()
        .await
    {
        Ok(response) => {
            let table_description = response.table_description();
            Ok(ApiResponse {
                status: 200,
                message: format!("GSI '{}' deletion initiated successfully", index_name),
                data: Some(json!({
                    "indexName": index_name,
                    "indexType": "GSI",
                    "tableStatus": table_description.and_then(|t| t.table_status().map(|s| s.as_str().to_string()))
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to delete GSI: {}", e),
            data: None,
        }),
    }
}
