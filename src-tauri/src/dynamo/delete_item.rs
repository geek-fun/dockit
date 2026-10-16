use crate::common::dynamodb_utils::convert_attributes;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::Value;

pub struct DeleteItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn delete_item(
    client: &Client,
    input: DeleteItemInput<'_>,
) -> Result<ApiResponse, String> {
    let keys = match convert_attributes(input.payload.get("keys"), "") {
        Ok(keys) if keys.is_empty() => {
            return Ok(ApiResponse {
                status: 400,
                message: "At least one key is required for deletion".to_string(),
                data: None,
            });
        }
        Ok(keys) => keys,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to delete item: key {e}"),
                data: None,
            });
        }
    };

    // Build the delete request
    let mut delete_item = client.delete_item().table_name(input.table_name);

    for (key, value) in keys {
        delete_item = delete_item.key(key, value);
    }

    match delete_item.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: "Item deleted successfully".to_string(),
            data: None,
        }),
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to delete item!\n\nError: {}\nDetails: {}",
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
                {"key": "age", "value": true, "type": "N"}
            ]
        });
        let response = delete_item(
            &client,
            DeleteItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("conversion failure is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(response.message.contains("key attribute 'age'"));
    }

    #[tokio::test]
    async fn numeric_string_key_reaches_the_delete_item_body() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DeleteItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "42", "type": "N"}]
        });
        let response = delete_item(
            &client,
            DeleteItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("delete_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1, "expected exactly one DeleteItem request");
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("request body is JSON");
        assert_eq!(body["TableName"], "users");
        assert_eq!(body["Key"]["id"]["N"], "42");
    }

    #[tokio::test]
    async fn key_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1"}]
        });
        let response = delete_item(
            &client,
            DeleteItemInput {
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

    #[tokio::test]
    async fn string_encoded_keys_are_accepted() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DeleteItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "keys": "[{\"key\":\"id\",\"value\":\"42\",\"type\":\"N\"}]"
        });
        let response = delete_item(
            &client,
            DeleteItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("delete_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        let body: serde_json::Value = serde_json::from_slice(&requests[0].body).expect("json");
        assert_eq!(body["Key"]["id"]["N"], "42");
    }
}
