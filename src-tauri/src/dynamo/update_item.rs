use crate::common::dynamodb_utils::convert_json_to_attr_value;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::Value;

pub struct UpdateItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn update_item(
    client: &Client,
    input: UpdateItemInput<'_>,
) -> Result<ApiResponse, String> {
    // Extract keys from the payload
    let keys = input
        .payload
        .get("keys")
        .and_then(|v| v.as_array())
        .ok_or("Keys array is required")?;

    // Extract attributes from the payload
    let attributes = input
        .payload
        .get("attributes")
        .and_then(|v| v.as_array())
        .ok_or("Attributes array is required")?;

    if attributes.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: "At least one attribute is required for update".to_string(),
            data: None,
        });
    }

    // Build the update request
    let mut update_item = client.update_item().table_name(input.table_name);

    // Add key attributes
    for key_attr in keys {
        if let (Some(key), Some(value), Some(attr_type)) = (
            key_attr.get("key").and_then(|v| v.as_str()),
            key_attr.get("value"),
            key_attr.get("type").and_then(|v| v.as_str()),
        ) {
            if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                update_item = update_item.key(key, av);
            }
        }
    }

    // Build update expression and expression attribute values
    let mut update_expression_parts: Vec<String> = Vec::new();
    let mut expression_attribute_names: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut expression_attribute_values: std::collections::HashMap<String, AttributeValue> =
        std::collections::HashMap::new();

    for (index, attr) in attributes.iter().enumerate() {
        if let (Some(key), Some(value), Some(attr_type)) = (
            attr.get("key").and_then(|v| v.as_str()),
            attr.get("value"),
            attr.get("type").and_then(|v| v.as_str()),
        ) {
            let name_placeholder = format!("#attr{}", index);
            let value_placeholder = format!(":val{}", index);

            expression_attribute_names.insert(name_placeholder.clone(), key.to_string());

            if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                expression_attribute_values.insert(value_placeholder.clone(), av);
                update_expression_parts.push(format!("{} = {}", name_placeholder, value_placeholder));
            }
        }
    }

    if update_expression_parts.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: "No valid attributes to update".to_string(),
            data: None,
        });
    }

    let update_expression = format!("SET {}", update_expression_parts.join(", "));

    // Add expression attribute names
    for (placeholder, name) in expression_attribute_names {
        update_item = update_item.expression_attribute_names(placeholder, name);
    }

    // Add expression attribute values
    for (placeholder, value) in expression_attribute_values {
        update_item = update_item.expression_attribute_values(placeholder, value);
    }

    update_item = update_item.update_expression(update_expression);

    match update_item.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: "Item updated successfully".to_string(),
            data: None,
        }),
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");
            
            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to update item!\n\nError: {}\nDetails: {}",
                    error_code, error_message
                ),
                data: None,
            })
        }
    }
}
