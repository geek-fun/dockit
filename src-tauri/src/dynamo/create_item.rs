use crate::common::dynamodb_utils::convert_json_to_attr_value;
use crate::dynamo::types::ApiResponse;
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

        match put_item.send().await {
            Ok(_) => Ok(ApiResponse {
                status: 200,
                message: "Item created successfully".to_string(),
                data: None,
            }),
            Err(e) => Ok(ApiResponse {
                status: 500,
                message: format!("Failed to create item: {}", e),
                data: None,
            }),
        }
    } else {
        Ok(ApiResponse {
            status: 400,
            message: "Attributes array is required".to_string(),
            data: None,
        })
    }
}
