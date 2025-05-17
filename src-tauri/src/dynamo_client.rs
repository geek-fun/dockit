use aws_config::meta::region::RegionProviderChain;
use aws_sdk_dynamodb::{Client, config::Credentials, types::AttributeValue};
use aws_config::Region;
use serde::{Deserialize, Serialize};
use serde_json::json;
use base64;

#[derive(Debug, Deserialize)]
pub struct DynamoCredentials {
    pub region: String,
    pub access_key_id: String, // AWS access key ID
    pub secret_access_key: String, // AWS secret access key
}

#[derive(Debug, Deserialize)]
pub struct DynamoOptions {
    pub table_name: String,
    pub operation: String,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    status: u16,
    message: String,
    data: Option<serde_json::Value>,
}

fn convert_json_to_attr_value(value: &serde_json::Value) -> Option<AttributeValue> {
    match value {
        serde_json::Value::String(s) => Some(AttributeValue::S(s.clone())),
        serde_json::Value::Number(n) => Some(AttributeValue::N(n.to_string())),
        serde_json::Value::Bool(b) => Some(AttributeValue::Bool(*b)),
        serde_json::Value::Null => Some(AttributeValue::Null(true)),
        serde_json::Value::Array(arr) => Some(AttributeValue::L(
            arr.iter().filter_map(|v| convert_json_to_attr_value(v)).collect()
        )),
        serde_json::Value::Object(map) => Some(AttributeValue::M(
            map.iter().filter_map(|(k, v)| {
                convert_json_to_attr_value(v).map(|av| (k.clone(), av))
            }).collect()
        )),
    }
}

#[tauri::command]
pub async fn dynamo_api(
    window: tauri::Window,
    credentials: DynamoCredentials,
    options: DynamoOptions,
) -> Result<String, String> {
    // Parse region
    let region_provider = RegionProviderChain::first_try(Region::new(credentials.region.clone()))
       .or_default_provider()
       .or_else("us-east-1");


    // Create credentials provider
    let creds = Credentials::new(
        credentials.access_key_id,
        credentials.secret_access_key,
        None, // session token
        None, // expiry
//         &options.table_name.clone()
        "dockit-client"
    );

    // Configure AWS SDK
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider)
        .credentials_provider(creds)
        .load()
        .await;

    let client = Client::new(&config);

    // Process operation
    let result = match options.operation.as_str() {
        "DESCRIBE_TABLE" => {
            match client.describe_table().table_name(&options.table_name).send().await {
                Ok(response) => {
                    // Create a custom serializable structure with the data we need
                    let table_info = json!({
                        "id": response.table().and_then(|t| t.table_id()),
                        "name": response.table().map(|t| t.table_name()),
                        "status": response.table().and_then(|t| t.table_status().map(|s| s.as_str().to_string())),                        "itemCount": response.table().and_then(|t| t.item_count()),
                        "sizeBytes": response.table().and_then(|t| t.table_size_bytes()),
                        "keySchema": response.table().and_then(|t| {
                            Some(t.key_schema().iter().map(|k| {
                                json!({
                                    "attributeName": k.attribute_name(),
                                    "keyType": format!("{:?}", k.key_type())
                                })
                            }).collect::<Vec<_>>())
                        }),
                        "attributeDefinitions": response.table().and_then(|t| {
                            Some(t.attribute_definitions().iter().map(|a| {
                                json!({
                                    "attributeName": a.attribute_name(),
                                    "attributeType": format!("{:?}", a.attribute_type())
                                })
                            }).collect::<Vec<_>>())
                        }),
                        "indices": response.table().map(|t| {
                            let mut indices = Vec::new();

                            // Add Global Secondary Indexes
                            let gsi_list = t.global_secondary_indexes();
                            if !gsi_list.is_empty() {
                                for gsi in gsi_list {
                                    let index_info = json!({
                                        "type": "GSI",
                                        "name": gsi.index_name(),
                                        "status": gsi.index_status().map(|s| s.as_str().to_string()),
                                        "keySchema": gsi.key_schema().iter().map(|k| {
                                            json!({
                                                "attributeName": k.attribute_name(),
                                                "keyType": format!("{:?}", k.key_type())
                                            })
                                        }).collect::<Vec<_>>(),
                                        "provisionedThroughput": gsi.provisioned_throughput().map(|pt| json!({
                                            "readCapacityUnits": pt.read_capacity_units(),
                                            "writeCapacityUnits": pt.write_capacity_units()
                                        }))
                                    });
                                    indices.push(index_info);
                                }
                            }

                            // Add Local Secondary Indexes
                            let lsi_list = t.local_secondary_indexes();
                            if !lsi_list.is_empty() {
                                for lsi in lsi_list {
                                    let index_info = json!({
                                        "type": "LSI",
                                        "name": lsi.index_name(),
                                        "keySchema": lsi.key_schema().iter().map(|k| {
                                            json!({
                                                "attributeName": k.attribute_name(),
                                                "keyType": format!("{:?}", k.key_type())
                                            })
                                        }).collect::<Vec<_>>()
                                    });
                                    indices.push(index_info);
                                }
                            }

                            indices
                        }),
                         "creationDateTime": response.table().and_then(|t|
                                t.creation_date_time().map(|dt| dt.to_string())),
                    });

                    Ok(ApiResponse {
                        status: 200,
                        message: "Table described successfully".to_string(),
                        data: Some(table_info),
                    })
                },
                Err(e) => Ok(ApiResponse {
                    status: 500,
                    message: format!("Failed to describe table: {}", e),
                    data: None,
                })
            }
        },
        "CREATE_ITEM" => {
            if let Some(payload) = &options.payload {
                // Expecting payload to have an "attributes" array
                if let Some(attributes) = payload.get("attributes").and_then(|v| v.as_array()) {
                    let mut put_item = client.put_item().table_name(&options.table_name);

                    for attr in attributes {
                        if let (Some(key), Some(value), Some(attr_type)) = (
                            attr.get("key").and_then(|v| v.as_str()),
                            attr.get("value"),
                            attr.get("type").and_then(|v| v.as_str()),
                        ) {
                            let attr_value = match attr_type {
                                "S" => value.as_str().map(|s| AttributeValue::S(s.to_string())),
                                "N" => value.as_f64().map(|n| AttributeValue::N(n.to_string())),
                                "B" => value.as_str().map(|s| AttributeValue::B(
                                    aws_sdk_dynamodb::primitives::Blob::new(base64::decode(s).unwrap_or_default())
                                )),
                                "BOOL" => value.as_bool().map(AttributeValue::Bool),
                                "NULL" => Some(AttributeValue::Null(true)),
                                "SS" => value.as_array().map(|arr| {
                                    AttributeValue::Ss(arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                                }),
                                "NS" => value.as_array().map(|arr| {
                                    AttributeValue::Ns(arr.iter().filter_map(|v| v.as_f64().map(|n| n.to_string())).collect())
                                }),
                                "BS" => value.as_array().map(|arr| {
                                    AttributeValue::Bs(arr.iter().filter_map(|v| v.as_str().map(|s| {
                                        aws_sdk_dynamodb::primitives::Blob::new(base64::decode(s).unwrap_or_default())
                                    })).collect())
                                }),
                                "L" => value.as_array().map(|arr| {
                                    AttributeValue::L(arr.iter().filter_map(|v| {
                                        // Recursively convert each element
                                        convert_json_to_attr_value(v)
                                    }).collect())
                                }),
                                "M" => value.as_object().map(|map| {
                                    AttributeValue::M(map.iter().filter_map(|(k, v)| {
                                        convert_json_to_attr_value(v).map(|av| (k.clone(), av))
                                    }).collect())
                                }),
                                _ => None,
                            };
                            if let Some(av) = attr_value {
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
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Item payload is required".to_string(),
                    data: None,
                })
            }
        },
        "QUERY_TABLE" => {
            // Extract query parameters from payload
            if let Some(payload) = &options.payload {
                // Extract query parameters
                let index_name = payload.get("index_name").and_then(|v| v.as_str());
                let sort_key = payload.get("sort_key");
                let filters = payload.get("filters").and_then(|v| v.as_array());

                let partition_key = payload.get("partition_key").unwrap().as_object().unwrap();
                let pk_name = partition_key.get("name").and_then(|v| v.as_str()).unwrap();
                let pk_value = partition_key.get("value").and_then(|v| v.as_str()).unwrap();

                // Start building the query
                let mut query = client.query().table_name(&options.table_name);

                // Add index name if provided
                if let Some(idx_name) = index_name {
                    query = query.index_name(idx_name);
                }

                let mut key_condition_expr = format!("{} = :pkey", pk_name);

                // Start building expression attribute values
                let mut expr_attr_values = std::collections::HashMap::new();
                expr_attr_values.insert(
                    ":pkey".to_string(),
                    AttributeValue::S(pk_value.to_string())
                );

                // Add sort key condition if provided
                if let Some(sk) = sort_key {
                    if let Some(sk_obj) = sk.as_object() {
                        let sk_name = sk_obj.get("name").and_then(|v| v.as_str());
                        let sk_value = sk_obj.get("value").and_then(|v| v.as_str());

                        if let (Some(sk_name), Some(sk_value)) = (sk_name, sk_value) {
                            // Extend key condition expression
                            key_condition_expr = format!("{} AND {} = :skey", key_condition_expr, sk_name);

                            // Add sort key to expression attribute values
                            expr_attr_values.insert(
                                ":skey".to_string(),
                                AttributeValue::S(sk_value.to_string())
                            );
                        }
                    }
                }

                // Set key condition expression
                query = query.key_condition_expression(key_condition_expr);

                // Add filters if provided
                if let Some(filter_array) = filters {
                    let mut filter_expressions = Vec::new();

                    for (i, filter) in filter_array.iter().enumerate() {
                        if let Some(filter_obj) = filter.as_object() {
                            let filter_key = filter_obj.get("key").and_then(|v| v.as_str());
                            let filter_op = filter_obj.get("operator").and_then(|v| v.as_str());
                            let filter_value = filter_obj.get("value").and_then(|v| v.as_str());

                            if let (Some(key), Some(op), Some(value)) = (filter_key, filter_op, filter_value) {
                                let filter_placeholder = format!(":filter{}", i);

                                // Map operator string to DynamoDB operator
                                let expr = match op {
                                    "=" => format!("{} = {}", key, filter_placeholder),
                                    "!=" => format!("{} <> {}", key, filter_placeholder),
                                    ">" => format!("{} > {}", key, filter_placeholder),
                                    ">=" => format!("{} >= {}", key, filter_placeholder),
                                    "<" => format!("{} < {}", key, filter_placeholder),
                                    "<=" => format!("{} <= {}", key, filter_placeholder),
                                    "CONTAINS" => format!("contains({}, {})", key, filter_placeholder),
                                    "BEGINS_WITH" => format!("begins_with({}, {})", key, filter_placeholder),
                                    _ => format!("{} = {}", key, filter_placeholder), // Default to equals
                                };

                                filter_expressions.push(expr);
                                expr_attr_values.insert(
                                    filter_placeholder,
                                    AttributeValue::S(value.to_string())
                                );
                            }
                        }
                    }

                    if !filter_expressions.is_empty() {
                        let filter_expr = filter_expressions.join(" AND ");
                        query = query.filter_expression(filter_expr);
                    }
                }

                // Add expression attribute values to query
                for (k, v) in expr_attr_values {
                    query = query.expression_attribute_values(k, v);
                }

                // Execute the query
                match query.send().await {
                    Ok(response) => {
                        // Create a response with the items
                        let items = response.items();

                        // Convert DynamoDB items to JSON
                        let json_items: Vec<serde_json::Value> = items.iter()
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
                                        let json_array: Vec<serde_json::Value> = list.iter()
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
                            message: "Query executed successfully".to_string(),
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
                    },
                    Err(e) => Ok(ApiResponse {
                        status: 500,
                        message: format!("Failed to execute query: {}", e),
                        data: None,
                    }),
                }
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Query parameters are required".to_string(),
                    data: None,
                })
            }
        },
        "SCAN_TABLE" => {
            // Extract scan parameters from payload
            if let Some(payload) = &options.payload {
                // Extract filters if provided
                let filters = payload.get("filters").and_then(|v| v.as_array());

                // Start building the scan
                let mut scan = client.scan().table_name(&options.table_name);

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
                                                "!=" => format!("{} <> {}", name_placeholder, filter_placeholder),
                                                ">" => format!("{} > {}", name_placeholder, filter_placeholder),
                                                ">=" => format!("{} >= {}", name_placeholder, filter_placeholder),
                                                "<" => format!("{} < {}", name_placeholder, filter_placeholder),
                                                "<=" => format!("{} <= {}", name_placeholder, filter_placeholder),
                                                "contains" => format!("contains({}, {})", name_placeholder, filter_placeholder),
                                                "not contains" => format!("not contains({}, {})", name_placeholder, filter_placeholder),
                                                "begins_with" => format!("begins_with({}, {})", name_placeholder, filter_placeholder),
                                                "attribute_exists" => format!("attribute_exists({})", name_placeholder),
                                                "attribute_not_exists" => format!("attribute_not_exists({})", name_placeholder),
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
                                   println!("[SCAN] Filter Expression: {},\nValues: {:?}", filter_expr, expression_values);
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
                        let json_items: Vec<serde_json::Value> =
                            items.iter()
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
                                        let json_array: Vec<serde_json::Value> = list.iter()
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
                    },
                    Err(e) => Ok(ApiResponse {
                        status: 500,
                        message: format!("Failed to execute scan: {:?}", e),
                        data: None,
                    }),
                }
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Scan parameters are required".to_string(),
                    data: None,
                })
            }
        },
        // Add more operations as needed
        _ => Ok(ApiResponse {
            status: 400,
            message: format!("Unsupported operation: {}", options.operation),
            data: None,
        }),
    };

    match result {
        Ok(response) => Ok(serde_json::to_string(&response).map_err(|e| e.to_string())?),
        Err(e) => {
            println!("Error: {}", e);
            let error_response = ApiResponse {
                status: 500,
                message: e,
                data: None,
            };
            Ok(serde_json::to_string(&error_response).map_err(|e| e.to_string())?)
        }
    }
}
