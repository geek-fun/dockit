use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::{
    AttributeDefinition, CreateGlobalSecondaryIndexAction, DeleteGlobalSecondaryIndexAction,
    GlobalSecondaryIndexUpdate, KeySchemaElement, KeyType, Projection, ProjectionType,
    ProvisionedThroughput, ScalarAttributeType, UpdateGlobalSecondaryIndexAction,
    WarmThroughput,
};
use aws_sdk_dynamodb::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct CreateGsiInput {
    pub table_name: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGsiInput {
    pub table_name: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct DeleteGsiInput {
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
    input: CreateGsiInput,
) -> Result<ApiResponse, String> {
    let payload = input.payload;

    // Extract index configuration from payload
    let index_name = payload
        .get("index_name")
        .and_then(|v| v.as_str())
        .ok_or("index_name is required")?;

    // Check if we have the new key_schema format or old partition_key/sort_key format
    let key_schema_items = if let Some(key_schema) = payload.get("key_schema").and_then(|v| v.as_array()) {
        // New format: key_schema array
        key_schema.to_vec()
    } else {
        // Old format: partition_key and sort_key (for backward compatibility)
        let partition_key_name = payload
            .get("partition_key")
            .and_then(|v| v.as_str())
            .ok_or("partition_key or key_schema is required")?;

        let partition_key_type = payload
            .get("partition_key_type")
            .and_then(|v| v.as_str())
            .unwrap_or("S");

        let mut schema = vec![json!({
            "attribute_name": partition_key_name,
            "key_type": "HASH",
            "attribute_type": partition_key_type
        })];

        if let Some(sort_key_name) = payload.get("sort_key").and_then(|v| v.as_str()) {
            if !sort_key_name.is_empty() {
                let sort_key_type = payload
                    .get("sort_key_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("S");
                
                schema.push(json!({
                    "attribute_name": sort_key_name,
                    "key_type": "RANGE",
                    "attribute_type": sort_key_type
                }));
            }
        }
        
        schema
    };

    // Build key schema from the items
    let mut key_schema = Vec::new();
    let mut attribute_definitions = Vec::new();

    for item in key_schema_items {
        let attr_name = item
            .get("attribute_name")
            .and_then(|v| v.as_str())
            .ok_or("attribute_name is required in key_schema")?;

        let key_type_str = item
            .get("key_type")
            .and_then(|v| v.as_str())
            .ok_or("key_type is required in key_schema")?;

        let attr_type_str = item
            .get("attribute_type")
            .and_then(|v| v.as_str())
            .unwrap_or("S");

        let key_type = match key_type_str.to_uppercase().as_str() {
            "HASH" => KeyType::Hash,
            "RANGE" => KeyType::Range,
            _ => KeyType::Hash,
        };

        key_schema.push(
            KeySchemaElement::builder()
                .attribute_name(attr_name)
                .key_type(key_type)
                .build()
                .map_err(|e| format!("Failed to build key schema: {}", e))?
        );

        attribute_definitions.push(
            AttributeDefinition::builder()
                .attribute_name(attr_name)
                .attribute_type(parse_scalar_type(attr_type_str))
                .build()
                .map_err(|e| format!("Failed to build attribute definition: {}", e))?
        );
    }

    let projection_type = payload
        .get("projection_type")
        .and_then(|v| v.as_str())
        .unwrap_or("ALL");

    let read_capacity = payload
        .get("read_capacity_units")
        .and_then(|v| v.as_i64());

    let write_capacity = payload
        .get("write_capacity_units")
        .and_then(|v| v.as_i64());

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

    // Build provisioned throughput and warm throughput
    let mut create_gsi_builder = CreateGlobalSecondaryIndexAction::builder()
        .index_name(index_name)
        .set_key_schema(Some(key_schema))
        .projection(projection);

    // Only set provisioned throughput if capacity values are provided
    if let (Some(read_cap), Some(write_cap)) = (read_capacity, write_capacity) {
        let provisioned_throughput = ProvisionedThroughput::builder()
            .read_capacity_units(read_cap)
            .write_capacity_units(write_cap)
            .build()
            .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;
        
        create_gsi_builder = create_gsi_builder.provisioned_throughput(provisioned_throughput);
    }

    // Add warm throughput if provided
    if let Some(warm_throughput) = payload.get("warm_throughput") {
        if let (Some(read_units), Some(write_units)) = (
            warm_throughput.get("read_units_per_second").and_then(|v| v.as_i64()),
            warm_throughput.get("write_units_per_second").and_then(|v| v.as_i64())
        ) {
            let warm_throughput_config = WarmThroughput::builder()
                .read_units_per_second(read_units)
                .write_units_per_second(write_units)
                .build();
            
            create_gsi_builder = create_gsi_builder.warm_throughput(warm_throughput_config);
        }
    }

    // Build the GSI create action
    let create_gsi_action = create_gsi_builder
        .build()
        .map_err(|e| format!("Failed to build GSI create action: {}", e))?;

    let gsi_update = GlobalSecondaryIndexUpdate::builder()
        .create(create_gsi_action)
        .build();

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
    input: UpdateGsiInput,
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
    input: DeleteGsiInput,
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
