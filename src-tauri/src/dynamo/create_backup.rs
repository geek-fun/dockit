use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn create_backup(
    client: &Client,
    table_name: &str,
    backup_name: &str,
) -> Result<ApiResponse, String> {
    match client
        .create_backup()
        .table_name(table_name)
        .backup_name(backup_name)
        .send()
        .await
    {
        Ok(output) => {
            let backup_arn = output
                .backup_details()
                .map(|d| d.backup_arn().to_string())
                .unwrap_or_default();
            let backup_status = output
                .backup_details()
                .map(|d| d.backup_status().as_str().to_string())
                .unwrap_or_default();
            let backup_type = output
                .backup_details()
                .map(|d| d.backup_type().as_str().to_string())
                .unwrap_or_default();
            let created_at = output
                .backup_details()
                .map(|d| format!("{}", d.backup_creation_date_time()))
                .unwrap_or_default();

            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "Backup '{}' created for table '{}'",
                    backup_name, table_name
                ),
                data: Some(json!({
                    "backupArn": backup_arn,
                    "backupName": backup_name,
                    "tableName": table_name,
                    "backupStatus": backup_status,
                    "backupType": backup_type,
                    "backupCreationDateTime": created_at,
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
                    "Failed to create backup '{}' for table '{}': [{}] {}",
                    backup_name, table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}
