use crate::common::dynamodb_utils::convert_attributes;
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
    let keys = match convert_attributes(input.payload.get("keys"), "") {
        Ok(keys) if keys.is_empty() => {
            return Ok(ApiResponse {
                status: 400,
                message: "At least one key is required for update".to_string(),
                data: None,
            });
        }
        Ok(keys) => keys,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to update item: key {e}"),
                data: None,
            });
        }
    };

    // Extract attributes from the payload
    let attributes = match convert_attributes(input.payload.get("attributes"), "") {
        Ok(attributes) if attributes.is_empty() => {
            return Ok(ApiResponse {
                status: 400,
                message: "At least one attribute is required for update".to_string(),
                data: None,
            });
        }
        Ok(attributes) => attributes,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to update item: {e}"),
                data: None,
            });
        }
    };

    // Build the update request
    let mut update_item = client.update_item().table_name(input.table_name);

    for (key, value) in keys {
        update_item = update_item.key(key, value);
    }

    // Build update expression and expression attribute values
    let mut update_expression_parts: Vec<String> = Vec::new();
    let mut expression_attribute_names: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut expression_attribute_values: std::collections::HashMap<String, AttributeValue> =
        std::collections::HashMap::new();

    for (index, (key, value)) in attributes.into_iter().enumerate() {
        let name_placeholder = format!("#attr{}", index);
        let value_placeholder = format!(":val{}", index);

        expression_attribute_names.insert(name_placeholder.clone(), key);

        expression_attribute_values.insert(value_placeholder.clone(), value);
        update_expression_parts.push(format!("{} = {}", name_placeholder, value_placeholder));
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
    async fn invalid_key_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "sk", "value": "nope", "type": "N"}
            ],
            "attributes": [{"key": "name", "value": "a", "type": "S"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("conversion failure is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(response.message.contains("key attribute 'sk'"));
    }

    #[tokio::test]
    async fn invalid_attribute_returns_400_after_a_valid_one() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [
                {"key": "name", "value": "a", "type": "S"},
                {"key": "age", "value": "x", "type": "N"}
            ]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
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

    #[tokio::test]
    async fn string_encoded_values_reach_the_update_expression() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.UpdateItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [
                {"key": "age", "value": "42", "type": "N"},
                {"key": "enabled", "value": "false", "type": "BOOL"}
            ]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("update_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1, "expected exactly one UpdateItem request");
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("request body is JSON");

        assert_eq!(body["Key"]["id"]["S"], "1");
        assert_eq!(body["ExpressionAttributeNames"]["#attr0"], "age");
        assert_eq!(body["ExpressionAttributeNames"]["#attr1"], "enabled");
        assert_eq!(body["ExpressionAttributeValues"][":val0"]["N"], "42");
        assert_eq!(body["ExpressionAttributeValues"][":val1"]["BOOL"], false);
        assert_eq!(
            body["UpdateExpression"],
            "SET #attr0 = :val0, #attr1 = :val1".to_string()
        );
    }

    #[tokio::test]
    async fn attribute_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [{"key": "age", "value": "42"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
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
    async fn key_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1"}],
            "attributes": [{"key": "name", "value": "a", "type": "S"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("a missing type is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response
                .message
                .contains("key attribute 'id' has no 'type'"),
            "{}",
            response.message
        );
    }
}
