use crate::common::dynamodb_utils::convert_json_to_attr_value;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::Value;
use std::collections::HashMap;

pub struct TransactWriteInput<'a> {
    pub transact_items: &'a Value,
}

pub async fn transact_write_items(
    client: &Client,
    input: TransactWriteInput<'_>,
) -> Result<ApiResponse, String> {
    let items_array = input
        .transact_items
        .as_array()
        .ok_or("transact_items must be a JSON array")?;

    if items_array.is_empty() {
        return Ok(ApiResponse {
            status: 200,
            message: "No transact items to process".to_string(),
            data: Some(serde_json::json!({
                "consumed_capacity": [],
                "item_collection_metrics": {}
            })),
        });
    }

    let mut transact_items: Vec<aws_sdk_dynamodb::types::TransactWriteItem> = Vec::new();

    for (idx, item) in items_array.iter().enumerate() {
        let op = item
            .get("op")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Missing 'op' field in transact item at index {}", idx))?;

        let table_name = item
            .get("table_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Missing 'table_name' in transact item at index {}", idx))?;

        let transact_item = match op {
            "put" => {
                let attributes = item
                    .get("attributes")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        format!("Missing 'attributes' array for 'put' at index {}", idx)
                    })?;

                let mut item_map: HashMap<String, AttributeValue> = HashMap::new();
                for attr in attributes {
                    if let (Some(key), Some(value), Some(attr_type)) = (
                        attr.get("key").and_then(|v| v.as_str()),
                        attr.get("value"),
                        attr.get("type").and_then(|v| v.as_str()),
                    ) {
                        if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                            item_map.insert(key.to_string(), av);
                        }
                    }
                }

                let put = aws_sdk_dynamodb::types::Put::builder()
                    .table_name(table_name)
                    .set_item(Some(item_map))
                    .build()
                    .map_err(|e| format!("Failed to build Put: {}", e))?;

                aws_sdk_dynamodb::types::TransactWriteItem::builder()
                    .put(put)
                    .build()
            }
            "update" => {
                let keys = item
                    .get("keys")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        format!("Missing 'keys' array for 'update' at index {}", idx)
                    })?;
                let attributes = item
                    .get("attributes")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        format!(
                            "Missing 'attributes' array for 'update' at index {}",
                            idx
                        )
                    })?;

                let mut key_map: HashMap<String, AttributeValue> = HashMap::new();
                for key_attr in keys {
                    if let (Some(key), Some(value), Some(attr_type)) = (
                        key_attr.get("key").and_then(|v| v.as_str()),
                        key_attr.get("value"),
                        key_attr.get("type").and_then(|v| v.as_str()),
                    ) {
                        if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                            key_map.insert(key.to_string(), av);
                        }
                    }
                }

                let mut update_expression_parts: Vec<String> = Vec::new();
                let mut expression_attribute_names: HashMap<String, String> =
                    HashMap::new();
                let mut expression_attribute_values: HashMap<String, AttributeValue> =
                    HashMap::new();

                for (attr_idx, attr) in attributes.iter().enumerate() {
                    if let (Some(key), Some(value), Some(attr_type)) = (
                        attr.get("key").and_then(|v| v.as_str()),
                        attr.get("value"),
                        attr.get("type").and_then(|v| v.as_str()),
                    ) {
                        let name_placeholder = format!("#attr{}", attr_idx);
                        let value_placeholder = format!(":val{}", attr_idx);

                        expression_attribute_names
                            .insert(name_placeholder.clone(), key.to_string());
                        if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                            expression_attribute_values
                                .insert(value_placeholder.clone(), av);
                            update_expression_parts.push(format!(
                                "{} = {}",
                                name_placeholder, value_placeholder
                            ));
                        }
                    }
                }

                let update_expression =
                    format!("SET {}", update_expression_parts.join(", "));

                let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
                    .table_name(table_name)
                    .set_key(Some(key_map))
                    .update_expression(update_expression);

                for (placeholder, name) in expression_attribute_names {
                    update_builder =
                        update_builder.expression_attribute_names(placeholder, name);
                }
                for (placeholder, value) in expression_attribute_values {
                    update_builder =
                        update_builder.expression_attribute_values(placeholder, value);
                }

                aws_sdk_dynamodb::types::TransactWriteItem::builder()
                    .update(update_builder.build().map_err(|e| {
                        format!("Failed to build Update: {}", e)
                    })?)
                    .build()
            }
            "delete" => {
                let keys = item
                    .get("keys")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| {
                        format!("Missing 'keys' array for 'delete' at index {}", idx)
                    })?;

                let mut key_map: HashMap<String, AttributeValue> = HashMap::new();
                for key_attr in keys {
                    if let (Some(key), Some(value), Some(attr_type)) = (
                        key_attr.get("key").and_then(|v| v.as_str()),
                        key_attr.get("value"),
                        key_attr.get("type").and_then(|v| v.as_str()),
                    ) {
                        if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                            key_map.insert(key.to_string(), av);
                        }
                    }
                }

                let delete = aws_sdk_dynamodb::types::Delete::builder()
                    .table_name(table_name)
                    .set_key(Some(key_map))
                    .build()
                    .map_err(|e| format!("Failed to build Delete: {}", e))?;

                aws_sdk_dynamodb::types::TransactWriteItem::builder()
                    .delete(delete)
                    .build()
            }
            _ => {
                return Err(format!(
                    "Unknown operation '{}' at index {}. Must be 'put', 'update', or 'delete'.",
                    op, idx
                ));
            }
        };

        transact_items.push(transact_item);
    }

    match client
        .transact_write_items()
        .set_transact_items(Some(transact_items))
        .send()
        .await
    {
        Ok(response) => {
            let consumed_count = response
                .consumed_capacity
                .as_ref()
                .map_or(0, |v| v.len());

            let consumed_capacity: Vec<Value> = response
                .consumed_capacity
                .unwrap_or_default()
                .iter()
                .map(|cc| {
                    serde_json::json!({
                        "table_name": cc.table_name().unwrap_or(""),
                        "capacity_units": cc.capacity_units().unwrap_or(0.0),
                        "read_capacity_units": cc.read_capacity_units().unwrap_or(0.0),
                        "write_capacity_units": cc.write_capacity_units().unwrap_or(0.0),
                    })
                })
                .collect();

            let item_collection_metrics: Value = response
                .item_collection_metrics
                .as_ref()
                .map(|icm| {
                    let map: serde_json::Map<String, Value> = icm
                        .iter()
                        .map(|(k, v)| {
                            let metric = v.first();
                            (
                                k.clone(),
                                serde_json::json!({
                                    "item_collection_key": metric
                                        .and_then(|m| m.item_collection_key())
                                        .map(|key_map| {
                                            let m: serde_json::Map<String, Value> = key_map
                                                .iter()
                                                .map(|(kk, kv)| {
                                                    (
                                                        kk.clone(),
                                                        crate::common::dynamodb_utils::convert_attr_value_to_json(kv),
                                                    )
                                                })
                                                .collect();
                                            Value::Object(m)
                                        }),
                                    "size_estimate_range_gb": metric
                                        .map(|m| m.size_estimate_range_gb())
                                        .map(|r| vec![r[0], r[1]]),
                                }),
                            )
                        })
                        .collect();
                    Value::Object(map)
                })
                .unwrap_or(Value::Object(serde_json::Map::new()));

            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "Transaction completed: {} items processed",
                    consumed_count
                ),
                data: Some(serde_json::json!({
                    "consumed_capacity": consumed_capacity,
                    "item_collection_metrics": item_collection_metrics,
                })),
            })
        }
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Transaction failed!\n\nError: {}\nDetails: {}\nNote: All changes in a failed transaction are rolled back automatically.",
                    error_code, error_message
                ),
                data: None,
            })
        }
    }
}
