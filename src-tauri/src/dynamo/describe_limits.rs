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
