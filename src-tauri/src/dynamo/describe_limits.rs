use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_limits(client: &Client) -> Result<ApiResponse, String> {
    match client.describe_limits().send().await {
        Ok(output) => Ok(ApiResponse {
            status: 200,
            message: "DynamoDB limits described successfully".to_string(),
            data: Some(json!({
                "accountMaxReadCapacityUnits": output.account_max_read_capacity_units(),
                "accountMaxWriteCapacityUnits": output.account_max_write_capacity_units(),
                "tableMaxReadCapacityUnits": output.table_max_read_capacity_units(),
                "tableMaxWriteCapacityUnits": output.table_max_write_capacity_units(),
            })),
        }),
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError").to_string();
            let error_message = e
                .message()
                .map(|m| m.to_string())
                .unwrap_or_else(|| format!("{:#}", e));
            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to describe DynamoDB limits: [{}] {}",
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
    async fn test_describe_limits_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DescribeLimits"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "AccountMaxReadCapacityUnits": 80000,
                "AccountMaxWriteCapacityUnits": 80000,
                "TableMaxReadCapacityUnits": 40000,
                "TableMaxWriteCapacityUnits": 40000,
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = describe_limits(&client)
            .await
            .expect("describe_limits should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        assert_eq!(data["accountMaxReadCapacityUnits"], 80000);
        assert_eq!(data["accountMaxWriteCapacityUnits"], 80000);
        assert_eq!(data["tableMaxReadCapacityUnits"], 40000);
        assert_eq!(data["tableMaxWriteCapacityUnits"], 40000);
    }

    #[tokio::test]
    async fn test_describe_limits_error() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DescribeLimits"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = describe_limits(&client)
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response
            .message
            .contains("Failed to describe DynamoDB limits"));
        assert!(response.data.is_none());
    }
}
