use crate::common::dynamodb_utils::{
    build_filter_expression, convert_attr_value_to_json, json_to_dynamodb_key_map,
    parse_string_to_attribute_value,
};
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};
pub struct ScanTableInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn scan_table(client: &Client, input: ScanTableInput<'_>) -> Result<ApiResponse, String> {
    let index_name = input.payload.get("index_name").and_then(|v| v.as_str());
    let filters = input.payload.get("filters").and_then(|v| v.as_array());
    let limit = input
        .payload
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as i32)
        .unwrap();
    let exclusive_start_key = input
        .payload
        .get("exclusive_start_key")
        .and_then(|v| v.as_object());

    // Start building the scan
    let mut scan = client.scan().table_name(input.table_name).limit(limit);

    if let Some(idx_name) = index_name {
        scan = scan.index_name(idx_name);
    }

    if let Some(key_map) = exclusive_start_key {
        let last_key_map = json_to_dynamodb_key_map(key_map);

        if !last_key_map.is_empty() {
            // Apply each key-value pair individually to match the method signature
            for (key, value) in last_key_map {
                scan = scan.exclusive_start_key(key, value);
            }
        }
    }

    // Add filters if provided
    if let Some(filter_array) = filters {
        let mut filter_expressions = Vec::new();
        let mut expression_values = Vec::<(String, AttributeValue)>::new();
        let mut expression_names = Vec::<(String, String)>::new();

        // First collect all filter expressions and values
        for (i, filter) in filter_array.iter().enumerate() {
            if let Some(filter_obj) = filter.as_object() {
                let filter_key = filter_obj.get("key").and_then(|v| v.as_str());
                let filter_op = filter_obj.get("operator").and_then(|v| v.as_str());
                let filter_value = filter_obj.get("value").and_then(|v| v.as_str());

                if let (Some(key), Some(op), Some(value)) = (filter_key, filter_op, filter_value) {
                    let name_placeholder = format!("#attr{}", i);
                    let filter_placeholder = format!(":filter{}", i);

                    let expr = build_filter_expression(&name_placeholder, &filter_placeholder, op);
                    let attr_value = parse_string_to_attribute_value(value);

                    filter_expressions.push(expr);
                    expression_values.push((filter_placeholder, attr_value));
                    expression_names.push((name_placeholder, key.to_string()));
                }
            }
        }

        if !filter_expressions.is_empty() {
            let filter_expr = filter_expressions.join(" AND ");
            scan = scan.filter_expression(filter_expr);

            // Apply all expression attribute values
            for (key, value) in expression_values {
                scan = scan.expression_attribute_values(key, value);
            }

            for (placeholder, name) in expression_names {
                scan = scan.expression_attribute_names(placeholder, name);
            }
        }
    }

    // Execute the scan
    match scan.send().await {
        Ok(response) => {
            // Create a response with the items
            let items = response.items();

            // Convert DynamoDB items to JSON
            let json_items: Vec<serde_json::Value> = items
                .iter()
                .map(|item| {
                    let json_item: serde_json::Map<String, Value> = item
                        .iter()
                        .map(|(k, v)| (k.clone(), convert_attr_value_to_json(v)))
                        .collect();
                    json!(json_item)
                })
                .collect();
            Ok(ApiResponse {
                status: 200,
                message: "Scan executed successfully".to_string(),
                data: Some(json!({
                    "items": json_items,
                    "count": response.count(),
                    "scanned_count": response.scanned_count(),
                    "last_evaluated_key": match response.last_evaluated_key() {
                        Some(key_map) => {
                            let json_map: serde_json::Map<String, Value> = key_map
                                .iter()
                                .map(|(k, v)| (k.clone(), convert_attr_value_to_json(v)))
                                .collect();
                            json!(json_map)
                        },
                        None => json!(null)
                    }
                })),
            })
        }
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError").to_string();
            let error_message = e.message().unwrap_or("UnknownError").to_string();

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to execute scan!\n\nerrorCode: {}\nmessage: {}",
                    error_code, error_message
                ),
                data: None,
            })
        }
    }
}
