use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::PointInTimeRecoverySpecification;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn update_continuous_backups(
    client: &Client,
    table_name: &str,
    pitr_enabled: bool,
) -> Result<ApiResponse, String> {
    let spec = PointInTimeRecoverySpecification::builder()
        .point_in_time_recovery_enabled(pitr_enabled)
        .build()
        .map_err(|e| format!("Failed to build PITR specification: {}", e))?;

    match client
        .update_continuous_backups()
        .table_name(table_name)
        .point_in_time_recovery_specification(spec)
        .send()
        .await
    {
        Ok(response) => {
            let status = response
                .continuous_backups_description()
                .and_then(|c| c.point_in_time_recovery_description())
                .and_then(|p| p.point_in_time_recovery_status())
                .map(|s| s.as_str())
                .unwrap_or("UNKNOWN");
            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "PITR updated successfully for table '{}', status: {}",
                    table_name, status
                ),
                data: Some(json!({
                    "tableName": table_name,
                    "pitrStatus": status,
                    "enabled": pitr_enabled,
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
                    "Failed to update PITR for table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}