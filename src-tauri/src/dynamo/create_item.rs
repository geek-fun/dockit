use crate::common::dynamodb_utils::convert_json_to_attr_value;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::Value;

pub struct CreateItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn create_item(
    client: &Client,
    input: CreateItemInput<'_>,
) -> Result<ApiResponse, String> {
    if let Some(attributes) = input.payload.get("attributes").and_then(|v| v.as_array()) {
        let mut put_item = client.put_item().table_name(input.table_name);

        // Check if we should skip existing items (append mode)
        let skip_existing = input.payload.get("skipExisting")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        for attr in attributes {
            if let (Some(key), Some(value), Some(attr_type)) = (
                attr.get("key").and_then(|v| v.as_str()),
                attr.get("value"),
                attr.get("type").and_then(|v| v.as_str()),
            ) {
                if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                    put_item = put_item.item(key, av);
                }
            }
        }

        // Add condition expression to prevent overwriting if skip_existing is true
        if skip_existing {
            // Get partition key name from payload
            if let Some(partition_key) = input.payload.get("partitionKey").and_then(|v| v.as_str()) {
                put_item = put_item.condition_expression(format!("attribute_not_exists({})", partition_key));
            }
        }

        match put_item.send().await {
            Ok(_) => Ok(ApiResponse {
                status: 200,
                message: "Item created successfully".to_string(),
                data: None,
            }),
            Err(e) => {
                let error_code = e.code().unwrap_or("UnknownError");
                let error_message = e.message().unwrap_or("Unknown error occurred");
                
                // If skip_existing is true and error is ConditionalCheckFailedException, treat as success (item already exists)
                if skip_existing && error_code == "ConditionalCheckFailedException" {
                    return Ok(ApiResponse {
                        status: 200,
                        message: "Item already exists, skipped".to_string(),
                        data: None,
                    });
                }
                
                Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Failed to create item!\n\nError: {}\nDetails: {}",
                        error_code, error_message
                    ),
                    data: None,
                })
            }
        }
    } else {
        Ok(ApiResponse {
            status: 400,
            message: "Attributes array is required".to_string(),
            data: None,
        })
    }
}
