use crate::common::dynamodb_utils::convert_attributes;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};

pub struct CreateItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn create_item(
    client: &Client,
    input: CreateItemInput<'_>,
) -> Result<ApiResponse, String> {
    let attributes = match convert_attributes(input.payload.get("attributes"), "") {
        Ok(attributes) if attributes.is_empty() => {
            return Ok(ApiResponse {
                status: 400,
                message: "Failed to create item: no attributes provided".to_string(),
                data: None,
            });
        }
        Ok(attributes) => attributes,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to create item: {e}"),
                data: None,
            });
        }
    };

    let mut put_item = client.put_item().table_name(input.table_name);

    // Check if we should skip existing items (append mode)
    let skip_existing = input
        .payload
        .get("skipExisting")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    for (key, value) in attributes {
        put_item = put_item.item(key, value);
    }

    // Add condition expression to prevent overwriting if skip_existing is true
    if skip_existing {
        let Some(partition_key) = input
            .payload
            .get("partitionKey")
            .and_then(|v| v.as_str())
            .filter(|key| !key.is_empty())
        else {
            return Ok(ApiResponse {
                status: 400,
                message: "partitionKey is required when skipExisting is true".to_string(),
                data: None,
            });
        };
        put_item = put_item
            .condition_expression("attribute_not_exists(#pk)")
            .expression_attribute_names("#pk", partition_key);
    }

    match put_item.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: "Item created successfully".to_string(),
            data: Some(json!({"created": true, "skipped": false})),
        }),
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");

            // If skip_existing is true and error is ConditionalCheckFailedException, treat as success (item already exists)
            if skip_existing && error_code == "ConditionalCheckFailedException" {
                return Ok(ApiResponse {
                    status: 200,
                    message: "Item already exists, skipped".to_string(),
                    data: Some(json!({"created": false, "skipped": true})),
                });
            }

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to create item!\n\nError: {}\nDetails: {}",
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
    async fn invalid_attribute_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "age", "value": "nope", "type": "N"}
            ]
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("conversion failure is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(response.message.contains("attribute 'age'"));
        assert!(response.message.contains("expected a number"));
    }

    fn mount_put_item_ok() -> wiremock::Mock {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.PutItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
    }

    async fn sent_body(server: &wiremock::MockServer) -> Value {
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1, "expected exactly one PutItem request");
        serde_json::from_slice(&requests[0].body).expect("request body is JSON")
    }

    #[tokio::test]
    async fn numeric_string_key_reaches_the_put_item_body() {
        let server = wiremock::MockServer::start().await;
        mount_put_item_ok().mount(&server).await;
        let client = make_mock_client(&server).await;

        // Text inputs send the partition key as a string, which used to be dropped silently
        // and made put_item fail with a missing-key error.
        let payload = serde_json::json!({
            "attributes": [{"key": "id", "value": "42", "type": "N"}]
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("create_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let body = sent_body(&server).await;
        assert_eq!(body["TableName"], "users");
        assert_eq!(body["Item"]["id"]["N"], "42");
    }

    #[tokio::test]
    async fn string_encoded_values_reach_the_put_item_body_with_their_types() {
        let server = wiremock::MockServer::start().await;
        mount_put_item_ok().mount(&server).await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "enabled", "value": "true", "type": "BOOL"},
                {"key": "tags", "value": "[\"a\", \"b\"]", "type": "SS"},
                {"key": "scores", "value": "[1, \"2.5\"]", "type": "NS"},
                {"key": "blob", "value": "aGVsbG8=", "type": "B"},
                {"key": "meta", "value": "{\"k\": 1}", "type": "M"},
                {"key": "items", "value": "[1, \"a\", true]", "type": "L"}
            ]
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("create_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let item = sent_body(&server).await["Item"].clone();
        assert_eq!(item["id"]["S"], "1");
        assert_eq!(item["enabled"]["BOOL"], true);
        assert_eq!(item["tags"]["SS"], serde_json::json!(["a", "b"]));
        assert_eq!(item["scores"]["NS"], serde_json::json!(["1", "2.5"]));
        assert_eq!(item["blob"]["B"], "aGVsbG8=");
        assert_eq!(item["meta"]["M"]["k"]["N"], "1");
        assert_eq!(
            item["items"]["L"],
            serde_json::json!([{"N": "1"}, {"S": "a"}, {"BOOL": true}])
        );
    }

    #[tokio::test]
    async fn attribute_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "age", "value": "42"}
            ]
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("a missing type is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response.message.contains("attribute 'age' has no 'type'"),
            "{}",
            response.message
        );
    }

    #[tokio::test]
    async fn empty_set_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "tags", "value": "[]", "type": "SS"}
            ]
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("an empty set is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response.message.contains("empty sets"),
            "{}",
            response.message
        );
    }

    #[tokio::test]
    async fn missing_attributes_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({});
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("no attributes is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response.message.contains("no attributes provided"),
            "{}",
            response.message
        );
    }

    #[tokio::test]
    async fn string_encoded_attributes_are_accepted() {
        // The agent tool schema declares `attributes` as a string, so the whole array can
        // arrive JSON-encoded. It must still reach DynamoDB with its types intact.
        let server = wiremock::MockServer::start().await;
        mount_put_item_ok().mount(&server).await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "attributes": "[{\"key\":\"id\",\"value\":\"42\",\"type\":\"N\"}]"
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("create_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        assert_eq!(sent_body(&server).await["Item"]["id"]["N"], "42");
    }
    #[tokio::test]
    async fn duplicate_protection_escapes_reserved_and_special_key_names() {
        let server = wiremock::MockServer::start().await;
        mount_put_item_ok().mount(&server).await;
        let client = make_mock_client(&server).await;
        let payload = serde_json::json!({"attributes":[{"key":"size.value","type":"S","value":"a"}],"skipExisting":true,"partitionKey":"size.value"});
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "qa",
                payload: &payload,
            },
        )
        .await
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.data.unwrap()["created"], true);
        let body = sent_body(&server).await;
        assert_eq!(body["ConditionExpression"], "attribute_not_exists(#pk)");
        assert_eq!(body["ExpressionAttributeNames"]["#pk"], "size.value");
    }

    #[tokio::test]
    async fn duplicate_protection_requires_partition_key_metadata() {
        let server = wiremock::MockServer::start().await;
        let client = make_mock_client(&server).await;
        let payload = serde_json::json!({"attributes":[{"key":"id","type":"N","value":"1"}],"skipExisting":true});
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "qa",
                payload: &payload,
            },
        )
        .await
        .unwrap();
        assert_eq!(response.status, 400);
        assert!(server.received_requests().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn duplicate_protection_returns_a_skipped_outcome() {
        use wiremock::matchers::{header, method};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("x-amz-target", "DynamoDB_20120810.PutItem"))
            .respond_with(ResponseTemplate::new(400).set_body_json(json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException",
                "message": "The conditional request failed"
            })))
            .expect(1)
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;
        let payload = json!({
            "attributes": [{"key": "id", "type": "S", "value": "existing"}],
            "skipExisting": true,
            "partitionKey": "id"
        });
        let response = create_item(
            &client,
            CreateItemInput {
                table_name: "qa",
                payload: &payload,
            },
        )
        .await
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(
            response.data,
            Some(json!({"created": false, "skipped": true}))
        );
        let request = sent_body(&server).await;
        assert_eq!(request["ConditionExpression"], "attribute_not_exists(#pk)");
    }
}
