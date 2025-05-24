use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};
pub struct ScanTableInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn scan_table(client: &Client, input: ScanTableInput<'_>) -> Result<ApiResponse, String> {
    let filters = input.payload.get("filters").and_then(|v| v.as_array());

    // Start building the scan
    let mut scan = client.scan().table_name(input.table_name);

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

                    // Map operator string to DynamoDB operator
                    let expr = match op {
                        "=" => format!("{} = {}", name_placeholder, filter_placeholder),
                        "!=" => {
                            format!("{} <> {}", name_placeholder, filter_placeholder)
                        }
                        ">" => format!("{} > {}", name_placeholder, filter_placeholder),
                        ">=" => {
                            format!("{} >= {}", name_placeholder, filter_placeholder)
                        }
                        "<" => format!("{} < {}", name_placeholder, filter_placeholder),
                        "<=" => {
                            format!("{} <= {}", name_placeholder, filter_placeholder)
                        }
                        "contains" => {
                            format!("contains({}, {})", name_placeholder, filter_placeholder)
                        }
                        "not contains" => {
                            format!("not contains({}, {})", name_placeholder, filter_placeholder)
                        }
                        "begins_with" => {
                            format!("begins_with({}, {})", name_placeholder, filter_placeholder)
                        }
                        "attribute_exists" => {
                            format!("attribute_exists({})", name_placeholder)
                        }
                        "attribute_not_exists" => {
                            format!("attribute_not_exists({})", name_placeholder)
                        }
                        _ => format!("{} = {}", name_placeholder, filter_placeholder), // Default to equals
                    };
                    let attr_value = if value.eq_ignore_ascii_case("true") {
                        AttributeValue::Bool(true)
                    } else if value.eq_ignore_ascii_case("false") {
                        AttributeValue::Bool(false)
                    } else if let Ok(_) = value.parse::<f64>() {
                        // If it parses as a number, use N type
                        AttributeValue::N(value.to_string())
                    } else {
                        // Default to string for all other cases
                        AttributeValue::S(value.to_string())
                    };

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
                    let mut json_item = serde_json::Map::new();

                    for (key, value) in item {
                        // Convert DynamoDB AttributeValue to JSON value
                        if let Ok(s) = value.as_s() {
                            json_item.insert(key.clone(), json!(s));
                        } else if let Ok(n) = value.as_n() {
                            json_item.insert(key.clone(), json!(n));
                        } else if let Ok(b) = value.as_bool() {
                            json_item.insert(key.clone(), json!(b));
                        } else if let Ok(list) = value.as_l() {
                            let json_array: Vec<serde_json::Value> = list
                                .iter()
                                .map(|item| {
                                    if let Ok(s) = item.as_s() {
                                        json!(s)
                                    } else if let Ok(n) = item.as_n() {
                                        json!(n)
                                    } else if let Ok(b) = item.as_bool() {
                                        json!(b)
                                    } else {
                                        json!(null)
                                    }
                                })
                                .collect();
                            json_item.insert(key.clone(), json!(json_array));
                        } else if let Ok(map) = value.as_m() {
                            let mut json_obj = serde_json::Map::new();
                            for (k, v) in map {
                                if let Ok(s) = v.as_s() {
                                    json_obj.insert(k.clone(), json!(s));
                                } else if let Ok(n) = v.as_n() {
                                    json_obj.insert(k.clone(), json!(n));
                                } else if let Ok(b) = v.as_bool() {
                                    json_obj.insert(k.clone(), json!(b));
                                } else {
                                    json_obj.insert(k.clone(), json!(null));
                                }
                            }
                            json_item.insert(key.clone(), json!(json_obj));
                        }
                        // Add other types as needed
                    }

                    json!(json_item)
                })
                .collect();
            Ok(ApiResponse {
                status: 200,
                message: "Scan executed successfully".to_string(),
                data: Some(json!({
                    "items": json_items,
                    "count": items.len(),
                    "scanned_count": response.scanned_count(),
                    "last_evaluated_key": match response.last_evaluated_key() {
                        Some(key_map) => {
                            let mut json_map = serde_json::Map::new();
                            for (k, v) in key_map {
                                if let Ok(s) = v.as_s() {
                                    json_map.insert(k.clone(), json!(s));
                                } else if let Ok(n) = v.as_n() {
                                    json_map.insert(k.clone(), json!(n));
                                } else if let Ok(b) = v.as_bool() {
                                    json_map.insert(k.clone(), json!(b));
                                } else {
                                    json_map.insert(k.clone(), json!(null));
                                }
                            }
                            json!(json_map)
                        },
                        None => json!(null)
                    }
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to execute scan: {:?}", e),
            data: None,
        }),
    }
}
