use crate::common::dynamodb_utils::{
    build_filter_expression, convert_attr_value_to_json, json_to_dynamodb_key_map,
};
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};

pub struct QueryTableInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn query_table(
    client: &Client,
    input: QueryTableInput<'_>,
) -> Result<ApiResponse, String> {
    let index_name = input.payload.get("index_name").and_then(|v| v.as_str());
    let sort_key = input.payload.get("sort_key");
    let filters = input.payload.get("filters").and_then(|v| v.as_array());

    let partition_key = input
        .payload
        .get("partition_key")
        .unwrap()
        .as_object()
        .unwrap();
    let pk_name = partition_key.get("name").and_then(|v| v.as_str()).unwrap();
    let pk_value = partition_key.get("value").and_then(|v| v.as_str()).unwrap();

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

    let mut query = client.query().table_name(input.table_name).limit(limit);

    if let Some(idx_name) = index_name {
        query = query.index_name(idx_name);
    }

    if let Some(key_map) = exclusive_start_key {
        let last_key_map = json_to_dynamodb_key_map(key_map);

        if !last_key_map.is_empty() {
            // Apply each key-value pair individually to match the method signature
            for (key, value) in last_key_map {
                query = query.exclusive_start_key(key, value);
            }
        }
    }

    // Attribute name placeholders
    let mut expr_attr_names = Vec::<(String, String)>::new();
    expr_attr_names.push(("#attr0".to_string(), pk_name.to_string()));
    let mut key_condition_expr = "#attr0 = :pkey".to_string();

    let mut expr_attr_values = std::collections::HashMap::new();
    expr_attr_values.insert(":pkey".to_string(), AttributeValue::S(pk_value.to_string()));

    // Sort key
    if let Some(sk) = sort_key {
        let sk_obj = sk.as_object().unwrap();
        let sk_name = sk_obj.get("name").and_then(|v| v.as_str()).unwrap();
        let sk_value = sk_obj.get("value").and_then(|v| v.as_str()).unwrap();
        expr_attr_names.push(("#attr1".to_string(), sk_name.to_string()));
        key_condition_expr = format!(
            "{} AND {} = :skey",
            key_condition_expr,
            "#attr1".to_string()
        );
        expr_attr_values.insert(":skey".to_string(), AttributeValue::S(sk_value.to_string()));
    }

    query = query.key_condition_expression(key_condition_expr);

    // Filters
    if let Some(filter_array) = filters {
        let mut filter_expressions = Vec::new();
        let mut filter_idx = 2; // 0: pk, 1: sk
        for (i, filter) in filter_array.iter().enumerate() {
            if let Some(filter_obj) = filter.as_object() {
                let filter_key = filter_obj.get("key").and_then(|v| v.as_str());
                let filter_op = filter_obj.get("operator").and_then(|v| v.as_str());
                let filter_value = filter_obj.get("value").and_then(|v| v.as_str());
                if let (Some(key), Some(op), Some(value)) = (filter_key, filter_op, filter_value) {
                    let name_placeholder = format!("#attr{}", filter_idx);
                    filter_idx += 1;
                    expr_attr_names.push((name_placeholder.clone(), key.to_string()));
                    let filter_placeholder = format!(":filter{}", i);
                    let expr = build_filter_expression(&name_placeholder, &filter_placeholder, op);
                    filter_expressions.push(expr);
                    expr_attr_values
                        .insert(filter_placeholder, AttributeValue::S(value.to_string()));
                }
            }
        }
        if !filter_expressions.is_empty() {
            let filter_expr = filter_expressions.join(" AND ");
            query = query.filter_expression(filter_expr);
        }
    }

    // Add all expression attribute names
    for (placeholder, name) in expr_attr_names {
        query = query.expression_attribute_names(placeholder, name);
    }
    // Add all expression attribute values
    for (k, v) in expr_attr_values {
        query = query.expression_attribute_values(k, v);
    }

    // Execute the query (rest unchanged)
    match query.send().await {
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
                message: "Query executed successfully".to_string(),
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
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to execute query: {:?}", e),
            data: None,
        }),
    }
}
