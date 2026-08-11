use crate::common::dynamodb_utils::convert_attr_value_to_json;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{AttributeValue, KeysAndAttributes};
use aws_sdk_dynamodb::Client;
use serde_json::Value;
use std::collections::HashMap;

pub struct BatchGetInput<'a> {
    pub request_items: &'a Value,
}

pub async fn batch_get_item(
    client: &Client,
    input: BatchGetInput<'_>,
) -> Result<ApiResponse, String> {
    let request_items_obj = input
        .request_items
        .as_object()
        .ok_or("request_items must be a JSON object with table names as keys")?;

    if request_items_obj.is_empty() {
        return Ok(ApiResponse {
            status: 200,
            message: "No tables requested".to_string(),
            data: Some(serde_json::json!({
                "responses": {},
                "unprocessed_keys": {}
            })),
        });
    }

    let mut dynamo_request_items: HashMap<String, KeysAndAttributes> = HashMap::new();

    for (table_name, table_config) in request_items_obj {
        let keys_array = table_config
            .get("keys")
            .and_then(|v| v.as_array())
            .ok_or_else(|| format!("Missing 'keys' array for table '{}'", table_name))?;

        if keys_array.is_empty() {
            continue;
        }

        let mut key_maps: Vec<HashMap<String, AttributeValue>> = Vec::new();

        for key_obj in keys_array {
            let attrs =
                key_obj.as_object().ok_or("Each key must be a JSON object")?;
            let mut key_map: HashMap<String, AttributeValue> = HashMap::new();
            for (attr_name, attr_val) in attrs {
                let av = infer_attr_value_from_json(attr_val);
                key_map.insert(attr_name.clone(), av);
            }
            key_maps.push(key_map);
        }

        let keys_and_attrs = KeysAndAttributes::builder()
            .set_keys(Some(key_maps))
            .build()
            .map_err(|e| format!("Failed to build KeysAndAttributes: {}", e))?;

        dynamo_request_items.insert(table_name.clone(), keys_and_attrs);
    }

    if dynamo_request_items.is_empty() {
        return Ok(ApiResponse {
            status: 200,
            message: "No valid keys provided".to_string(),
            data: Some(serde_json::json!({
                "responses": {},
                "unprocessed_keys": {}
            })),
        });
    }

    match client
        .batch_get_item()
        .set_request_items(Some(dynamo_request_items))
        .send()
        .await
    {
        Ok(response) => {
            let total_items: usize = response
                .responses
                .as_ref()
                .map(|r| r.values().map(|items| items.len()).sum())
                .unwrap_or(0);

            let responses: HashMap<String, Vec<Value>> = response
                .responses
                .unwrap_or_default()
                .into_iter()
                .map(|(table_name, items)| {
                    let json_items: Vec<Value> = items
                        .iter()
                        .map(|item| {
                            let map: serde_json::Map<String, Value> = item
                                .iter()
                                .map(|(k, v)| {
                                    (k.clone(), convert_attr_value_to_json(v))
                                })
                                .collect();
                            Value::Object(map)
                        })
                        .collect();
                    (table_name, json_items)
                })
                .collect();

            let unprocessed_keys: Value = response
                .unprocessed_keys
                .as_ref()
                .map(|uk| {
                    let map: serde_json::Map<String, Value> = uk
                        .iter()
                        .map(|(table_name, keys_and_attrs)| {
                            let keys_json: Vec<Value> = keys_and_attrs
                                .keys()
                                .iter()
                                .map(|key_map| {
                                    let m: serde_json::Map<String, Value> = key_map
                                        .iter()
                                        .map(|(k, v)| {
                                            (k.clone(), convert_attr_value_to_json(v))
                                        })
                                        .collect();
                                    Value::Object(m)
                                })
                                .collect();
                            (table_name.clone(), Value::Array(keys_json))
                        })
                        .collect();
                    Value::Object(map)
                })
                .unwrap_or(Value::Object(serde_json::Map::new()));

            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "Batch get completed: {} items returned across {} tables",
                    total_items,
                    responses.len()
                ),
                data: Some(serde_json::json!({
                    "responses": responses,
                    "unprocessed_keys": unprocessed_keys,
                })),
            })
        }
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to batch get items!\n\nError: {}\nDetails: {}",
                    error_code, error_message
                ),
                data: None,
            })
        }
    }
}

/// Infers a DynamoDB AttributeValue from a JSON value without explicit type.
fn infer_attr_value_from_json(value: &Value) -> AttributeValue {
    match value {
        Value::String(s) => AttributeValue::S(s.clone()),
        Value::Number(n) => AttributeValue::N(n.to_string()),
        Value::Bool(b) => AttributeValue::Bool(*b),
        Value::Null => AttributeValue::Null(true),
        Value::Array(arr) => AttributeValue::L(
            arr.iter().map(infer_attr_value_from_json).collect(),
        ),
        Value::Object(map) => AttributeValue::M(
            map.iter()
                .map(|(k, v)| (k.clone(), infer_attr_value_from_json(v)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_dynamodb::types::AttributeValue;

    #[test]
    fn test_infer_string() {
        let av = infer_attr_value_from_json(&serde_json::json!("hello"));
        assert!(matches!(av, AttributeValue::S(ref s) if s == "hello"));
    }

    #[test]
    fn test_infer_number() {
        let av = infer_attr_value_from_json(&serde_json::json!(42));
        assert!(matches!(av, AttributeValue::N(ref n) if n == "42"));
    }

    #[test]
    fn test_infer_bool() {
        let av = infer_attr_value_from_json(&serde_json::json!(true));
        assert!(matches!(av, AttributeValue::Bool(true)));
    }

    #[test]
    fn test_infer_null() {
        let av = infer_attr_value_from_json(&serde_json::json!(null));
        assert!(matches!(av, AttributeValue::Null(true)));
    }

    #[test]
    fn test_infer_array() {
        let av = infer_attr_value_from_json(&serde_json::json!([1, "two", false]));
        match av {
            AttributeValue::L(items) => {
                assert_eq!(items.len(), 3);
                assert!(matches!(items[0], AttributeValue::N(_)));
                assert!(matches!(items[1], AttributeValue::S(_)));
                assert!(matches!(items[2], AttributeValue::Bool(_)));
            }
            _ => panic!("expected L"),
        }
    }

    #[test]
    fn test_infer_object() {
        let av = infer_attr_value_from_json(&serde_json::json!({"a": "x", "b": 99}));
        match av {
            AttributeValue::M(map) => {
                assert_eq!(map.len(), 2);
                assert!(map.get("a").is_some());
                assert!(map.get("b").is_some());
            }
            _ => panic!("expected M"),
        }
    }

    // ── Integration tests with wiremock (mock DynamoDB HTTP API) ─────────────

    async fn make_mock_client(
        server: &wiremock::MockServer,
    ) -> aws_sdk_dynamodb::Client {
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
    async fn test_batch_get_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.BatchGetItem",
            ))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "Responses": {
                        "users": [
                            {"id": {"S": "1"}, "name": {"S": "Alice"}},
                            {"id": {"S": "2"}, "name": {"S": "Bob"}}
                        ]
                    },
                    "UnprocessedKeys": {}
                })),
            )
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = BatchGetInput {
            request_items: &serde_json::json!({
                "users": {
                    "keys": [{"id": "1"}, {"id": "2"}]
                }
            }),
        };
        let response = batch_get_item(&client, input)
            .await
            .expect("batch_get_item should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("2 items returned"));
        let data = response.data.expect("data should be present");
        let responses = data["responses"]
            .as_object()
            .expect("responses should be an object");
        assert_eq!(responses.len(), 1);
        let users = responses["users"]
            .as_array()
            .expect("users should be an array");
        assert_eq!(users.len(), 2);
        assert_eq!(users[0]["id"], "1");
        assert_eq!(users[0]["name"], "Alice");
    }

    #[tokio::test]
    async fn test_batch_get_success_with_unprocessed() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.BatchGetItem",
            ))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "Responses": {"users": [{"id": {"S": "1"}}]},
                    "UnprocessedKeys": {
                        "orders": {
                            "Keys": [{"id": {"S": "99"}}]
                        }
                    }
                })),
            )
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = BatchGetInput {
            request_items: &serde_json::json!({
                "users": {"keys": [{"id": "1"}]},
                "orders": {"keys": [{"id": "99"}]}
            }),
        };
        let response = batch_get_item(&client, input)
            .await
            .expect("batch_get_item should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        let unprocessed = &data["unprocessed_keys"];
        assert!(unprocessed.as_object().unwrap().contains_key("orders"));
    }

    #[tokio::test]
    async fn test_batch_get_error_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.BatchGetItem",
            ))
            .respond_with(
                ResponseTemplate::new(400).set_body_json(serde_json::json!({
                    "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                    "message": "Requested resource not found"
                })),
            )
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = BatchGetInput {
            request_items: &serde_json::json!({
                "t": {"keys": [{"id": "1"}]}
            }),
        };
        let response = batch_get_item(&client, input)
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to batch get items"));
    }

    #[tokio::test]
    async fn test_batch_get_empty_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.BatchGetItem",
            ))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "Responses": {},
                    "UnprocessedKeys": {}
                })),
            )
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = BatchGetInput {
            request_items: &serde_json::json!({
                "t": {"keys": [{"id": "1"}]}
            }),
        };
        let response = batch_get_item(&client, input)
            .await
            .expect("batch_get_item should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("0 items returned"));
    }
}
