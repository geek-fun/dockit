use crate::common::json_utils::build_attribute_value;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::Client;
use serde_json::Value;

pub struct DeleteItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn delete_item(
    client: &Client,
    input: DeleteItemInput<'_>,
) -> Result<ApiResponse, String> {
    // Extract keys from the payload
    let keys = input
        .payload
        .get("keys")
        .and_then(|v| v.as_array())
        .ok_or("Keys array is required")?;

    if keys.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: "At least one key is required for deletion".to_string(),
            data: None,
        });
    }

    // Build the delete request
    let mut delete_item = client.delete_item().table_name(input.table_name);

    // Add key attributes
    for key_attr in keys {
        if let (Some(key), Some(value), Some(attr_type)) = (
            key_attr.get("key").and_then(|v| v.as_str()),
            key_attr.get("value"),
            key_attr.get("type").and_then(|v| v.as_str()),
        ) {
            let attr_value = build_attribute_value(value, attr_type);
            if let Some(av) = attr_value {
                delete_item = delete_item.key(key, av);
            }
        }
    }

    match delete_item.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: "Item deleted successfully".to_string(),
            data: None,
        }),
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to delete item: {}", e),
            data: None,
        }),
    }
}
