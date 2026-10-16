use crate::common::dynamodb_utils::{convert_attributes, resolve_json_argument};
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
    let resolved_items = resolve_json_argument(input.transact_items)?;
    let items_array = resolved_items
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
                let attributes = item.get("attributes").ok_or_else(|| {
                    format!("Missing 'attributes' array for 'put' at index {}", idx)
                })?;

                let item_map: HashMap<String, AttributeValue> =
                    convert_attributes(Some(attributes), &format!(" in 'put' at index {idx}"))?
                        .into_iter()
                        .collect();

                if item_map.is_empty() {
                    return Err(format!("No attributes provided for 'put' at index {idx}"));
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
                    .ok_or_else(|| format!("Missing 'keys' array for 'update' at index {}", idx))?;
                let attributes = item.get("attributes").ok_or_else(|| {
                    format!("Missing 'attributes' array for 'update' at index {}", idx)
                })?;

                let context = format!(" in 'update' at index {idx}");
                let keys =
                    convert_attributes(Some(keys), &context).map_err(|e| format!("key {e}"))?;
                let attributes = convert_attributes(Some(attributes), &context)?;

                if keys.is_empty() {
                    return Err(format!("No keys provided for 'update' at index {idx}"));
                }
                if attributes.is_empty() {
                    return Err(format!(
                        "No attributes provided for 'update' at index {idx}"
                    ));
                }

                let key_map: HashMap<String, AttributeValue> = keys.into_iter().collect();

                let mut update_expression_parts: Vec<String> = Vec::new();
                let mut expression_attribute_names: HashMap<String, String> = HashMap::new();
                let mut expression_attribute_values: HashMap<String, AttributeValue> =
                    HashMap::new();

                for (attr_idx, (key, value)) in attributes.into_iter().enumerate() {
                    let name_placeholder = format!("#attr{}", attr_idx);
                    let value_placeholder = format!(":val{}", attr_idx);

                    expression_attribute_names.insert(name_placeholder.clone(), key);
                    expression_attribute_values.insert(value_placeholder.clone(), value);
                    update_expression_parts
                        .push(format!("{} = {}", name_placeholder, value_placeholder));
                }

                let update_expression = format!("SET {}", update_expression_parts.join(", "));

                let mut update_builder = aws_sdk_dynamodb::types::Update::builder()
                    .table_name(table_name)
                    .set_key(Some(key_map))
                    .update_expression(update_expression);

                for (placeholder, name) in expression_attribute_names {
                    update_builder = update_builder.expression_attribute_names(placeholder, name);
                }
                for (placeholder, value) in expression_attribute_values {
                    update_builder = update_builder.expression_attribute_values(placeholder, value);
                }

                aws_sdk_dynamodb::types::TransactWriteItem::builder()
                    .update(
                        update_builder
                            .build()
                            .map_err(|e| format!("Failed to build Update: {}", e))?,
                    )
                    .build()
            }
            "delete" => {
                let keys = item
                    .get("keys")
                    .ok_or_else(|| format!("Missing 'keys' array for 'delete' at index {}", idx))?;

                let key_map: HashMap<String, AttributeValue> =
                    convert_attributes(Some(keys), &format!(" in 'delete' at index {idx}"))
                        .map_err(|e| format!("key {e}"))?
                        .into_iter()
                        .collect();

                if key_map.is_empty() {
                    return Err(format!("No keys provided for 'delete' at index {idx}"));
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
            let consumed_count = response.consumed_capacity.as_ref().map_or(0, |v| v.len());

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
                message: format!("Transaction completed: {} items processed", consumed_count),
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

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_mock_client(server: &wiremock::MockServer) -> aws_sdk_dynamodb::Client {
        let config = serde_json::json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "test",
            "secretAccessKey": "test",
            "endpointUrl": server.uri(),
        });
        crate::common::dynamo::create_dynamo_client(&config, None)
            .await
            .expect("client creation should succeed")
    }

    #[tokio::test]
    async fn test_transact_write_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.TransactWriteItems",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "ConsumedCapacity": [
                    {"TableName": "users", "CapacityUnits": 1.0}
                ],
                "ItemCollectionMetrics": {}
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let items = serde_json::json!([
            {"op": "put", "table_name": "users", "attributes": [{"key": "id", "value": "1", "type": "S"}, {"key": "name", "value": "Alice", "type": "S"}]}
        ]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let response = transact_write_items(&client, input)
            .await
            .expect("transact_write_items should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("1 items processed"));
        let data = response.data.expect("data should be present");
        let consumed = data["consumed_capacity"]
            .as_array()
            .expect("consumed_capacity should be an array");
        assert_eq!(consumed.len(), 1);
        assert_eq!(consumed[0]["table_name"], "users");
    }

    #[tokio::test]
    async fn test_transact_write_success_with_item_metrics() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.TransactWriteItems",
            ))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "ConsumedCapacity": [],
                    "ItemCollectionMetrics": {
                        "users": [
                            {"ItemCollectionKey": {"pk": {"S": "val"}}, "SizeEstimateRangeGB": [0.0, 1.0]}
                        ]
                    }
                })),
            )
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let items = serde_json::json!([
            {"op": "delete", "table_name": "users", "keys": [{"key": "id", "value": "1", "type": "S"}]}
        ]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let response = transact_write_items(&client, input)
            .await
            .expect("transact_write_items should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        let metrics = &data["item_collection_metrics"];
        assert!(metrics.as_object().unwrap().contains_key("users"));
    }

    #[tokio::test]
    async fn test_transact_write_error_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.TransactWriteItems",
            ))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#TransactionCanceledException",
                "message": "Transaction cancelled"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let items = serde_json::json!([
            {"op": "put", "table_name": "users", "attributes": [{"key": "id", "value": "1", "type": "S"}]}
        ]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let response = transact_write_items(&client, input)
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Transaction failed"));
    }

    #[tokio::test]
    async fn test_transact_write_empty() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let response = transact_write_items(&client, input)
            .await
            .expect("empty items should succeed");
        assert_eq!(response.status, 200);
        assert!(response.message.contains("No transact items"));
    }

    #[tokio::test]
    async fn test_transact_write_non_array_items() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!({"not": "array"});
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON array"));
    }

    #[tokio::test]
    async fn test_transact_write_missing_op() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"table_name": "t"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'op' field"));
    }

    #[tokio::test]
    async fn test_transact_write_missing_table_name() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "put"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing 'table_name'"));
    }

    #[tokio::test]
    async fn test_transact_write_update_missing_keys() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "update", "table_name": "t"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'keys' array for 'update'"));
    }

    #[tokio::test]
    async fn test_transact_write_update_missing_attributes() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "update", "table_name": "t", "keys": []}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'attributes' array for 'update'"));
    }

    #[tokio::test]
    async fn test_transact_write_put_missing_attributes() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "put", "table_name": "t"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'attributes' array for 'put'"));
    }

    #[tokio::test]
    async fn test_transact_write_delete_missing_keys() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "delete", "table_name": "t"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Missing 'keys' array for 'delete'"));
    }

    #[tokio::test]
    async fn test_transact_write_unknown_op() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{"op": "upsert", "table_name": "t"}]);
        let input = TransactWriteInput {
            transact_items: &items,
        };
        let result = transact_write_items(&client, input).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown operation 'upsert'"));
    }

    #[tokio::test]
    async fn test_transact_write_put_invalid_attribute() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{
            "op": "put",
            "table_name": "t",
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "age", "value": "x", "type": "N"}
            ]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("attribute 'age' in 'put' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_update_invalid_key() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{
            "op": "update",
            "table_name": "t",
            "keys": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "sk", "value": "x", "type": "N"}
            ],
            "attributes": [{"key": "name", "value": "a", "type": "S"}]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("key attribute 'sk' in 'update' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_update_invalid_attribute() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{
            "op": "update",
            "table_name": "t",
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [
                {"key": "name", "value": "a", "type": "S"},
                {"key": "flag", "value": "maybe", "type": "BOOL"}
            ]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("attribute 'flag' in 'update' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_delete_invalid_key() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{
            "op": "delete",
            "table_name": "t",
            "keys": [{"key": "id", "value": "nope", "type": "BOOL"}]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("key attribute 'id' in 'delete' at index 0"));
    }

    #[tokio::test]
    async fn test_transact_write_conversion_failure_sends_nothing() {
        let server = wiremock::MockServer::start().await;
        let client = make_mock_client(&server).await;
        let items = serde_json::json!([{
            "op": "put",
            "table_name": "t",
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "age", "value": "x", "type": "N"}
            ]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(err.contains("attribute 'age' in 'put' at index 0"));

        // A transaction is all-or-nothing: nothing may reach the wire.
        let requests = server.received_requests().await.expect("recorded requests");
        assert!(requests.is_empty(), "no request should be sent");
    }

    #[tokio::test]
    async fn test_transact_write_numeric_string_key_reaches_the_body() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.TransactWriteItems",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let items = serde_json::json!([{
            "op": "put",
            "table_name": "t",
            "attributes": [{"key": "id", "value": "42", "type": "N"}]
        }]);
        let response = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .expect("transact returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1);
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("request body is JSON");
        assert_eq!(body["TransactItems"][0]["Put"]["Item"]["id"]["N"], "42");
        assert_eq!(body["TransactItems"][0]["Put"]["TableName"], "t");
    }

    #[tokio::test]
    async fn test_transact_write_put_attribute_without_type() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = serde_json::json!([{
            "op": "put",
            "table_name": "t",
            "attributes": [{"key": "id", "value": "1"}]
        }]);
        let err = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .unwrap_err();
        assert!(
            err.contains("attribute 'id' in 'put' at index 0 has no 'type'"),
            "{err}"
        );
    }

    #[tokio::test]
    async fn test_transact_write_accepts_string_encoded_items() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.TransactWriteItems",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        // The agent tool schema declares transact_items as a string.
        let items = serde_json::json!(
            "[{\"op\":\"put\",\"table_name\":\"t\",\"attributes\":[{\"key\":\"id\",\"value\":\"42\",\"type\":\"N\"}]}]"
        );
        let response = transact_write_items(
            &client,
            TransactWriteInput {
                transact_items: &items,
            },
        )
        .await
        .expect("transact returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body).expect("json");
        assert_eq!(body["TransactItems"][0]["Put"]["Item"]["id"]["N"], "42");
    }
}
