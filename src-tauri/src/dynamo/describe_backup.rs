use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_backup(client: &Client, backup_arn: &str) -> Result<ApiResponse, String> {
    match client.describe_backup().backup_arn(backup_arn).send().await {
        Ok(output) => {
            let backup = output.backup_description().map(|desc| {
                let details = desc.backup_details();
                let source = desc.source_table_details();
                json!({
                    "backupArn": details.map(|d| d.backup_arn().to_string()),
                    "backupName": details.map(|d| d.backup_name().to_string()),
                    "backupSizeBytes": details.and_then(|d| d.backup_size_bytes()),
                    "backupStatus": details.map(|d| d.backup_status().as_str()),
                    "backupType": details.map(|d| d.backup_type().as_str()),
                    "backupCreationDateTime": details.map(|d| format!("{}", d.backup_creation_date_time())),
                    "backupExpiryDateTime": details
                        .and_then(|d| d.backup_expiry_date_time())
                        .map(|d| format!("{}", d)),
                    "sourceTableName": source.map(|s| s.table_name().to_string()),
                    "sourceTableId": source.map(|s| s.table_id().to_string()),
                    "sourceTableArn": source.and_then(|s| s.table_arn().map(|a| a.to_string())),
                    "sourceTableSizeBytes": source.and_then(|s| s.table_size_bytes()),
                    "sourceTableBillingMode": source
                        .and_then(|s| s.billing_mode().map(|b| b.as_str())),
                })
            });

            Ok(ApiResponse {
                status: 200,
                message: "Backup described successfully".to_string(),
                data: Some(json!({ "backup": backup })),
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
                    "Failed to describe backup '{}': [{}] {}",
                    backup_arn, error_code, error_message
                ),
                data: None,
            })
        }
    }
}
