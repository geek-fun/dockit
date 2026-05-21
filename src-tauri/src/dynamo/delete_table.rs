use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn delete_table(client: &Client, table_name: &str) -> Result<ApiResponse, String> {
    match client.delete_table().table_name(table_name).send().await {
        Ok(response) => {
            let deleted_table_name = response
                .table_description()
                .and_then(|t| t.table_name())
                .unwrap_or(table_name);
            Ok(ApiResponse {
                status: 200,
                message: format!("Table '{}' deleted successfully", deleted_table_name),
                data: Some(json!({
                    "tableName": deleted_table_name,
                })),
            })
        }
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError").to_string();
            let error_message = e
                .message()
                .map(|m| m.to_string())
                .unwrap_or_else(|| format!("{:#}", e));
            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to delete table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}
