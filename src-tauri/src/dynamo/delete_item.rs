use crate::common::dynamodb_utils::convert_json_to_attr_value;
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
    // Extract keys from the payload
    let keys = input
        .payload
        .get("keys")
        .and_then(|v| v.as_array())
        .ok_or("Keys array is required")?;

    if keys.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: "At least one key is required for deletion".to_string(),
            data: None,
        });
    }

    // Build the delete request
    let mut delete_item = client.delete_item().table_name(input.table_name);

    // Add key attributes
    for key_attr in keys {
        if let (Some(key), Some(value), Some(attr_type)) = (
            key_attr.get("key").and_then(|v| v.as_str()),
            key_attr.get("value"),
            key_attr.get("type").and_then(|v| v.as_str()),
        ) {
            match convert_json_to_attr_value(value, attr_type) {
                Ok(av) => delete_item = delete_item.key(key, av),
                Err(e) => {
                    return Ok(ApiResponse {
                        status: 400,
                        message: format!("Failed to delete item: key attribute '{key}': {e}"),
                        data: None,
                    });
                }
            }
        }
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
}
