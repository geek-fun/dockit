use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::BackupTypeFilter;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn list_backups(
    client: &Client,
    table_name: Option<String>,
    backup_type: Option<String>,
) -> Result<ApiResponse, String> {
    let backup_type_filter = match backup_type {
        Some(t) if !t.is_empty() => match t.to_uppercase().as_str() {
            "USER" => Some(BackupTypeFilter::User),
            "SYSTEM" => Some(BackupTypeFilter::System),
            "AWS_BACKUP" => Some(BackupTypeFilter::AwsBackup),
            "ALL" => Some(BackupTypeFilter::All),
            other => {
                return Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Invalid backup_type '{}': must be USER, SYSTEM, AWS_BACKUP, or ALL",
                        other
                    ),
                    data: None,
                })
            }
        },
        _ => None,
    };

    let mut all_backups: Vec<serde_json::Value> = Vec::new();
    let mut exclusive_start_backup_arn: Option<String> = None;

    loop {
        let mut request = client.list_backups();
        if let Some(tn) = table_name.as_ref() {
            request = request.table_name(tn);
        }
        if let Some(bt) = backup_type_filter.clone() {
            request = request.backup_type(bt);
        }
        if let Some(start) = exclusive_start_backup_arn.as_ref() {
            request = request.exclusive_start_backup_arn(start);
        }

        match request.send().await {
            Ok(response) => {
                for summary in response.backup_summaries() {
                    all_backups.push(json!({
                        "backupArn": summary.backup_arn(),
                        "backupName": summary.backup_name(),
                        "tableName": summary.table_name(),
                        "backupStatus": summary.backup_status().map(|s| s.as_str()),
                        "backupType": summary.backup_type().map(|t| t.as_str()),
                        "backupCreationDateTime": summary
                            .backup_creation_date_time()
                            .map(|d| format!("{}", d)),
                    }));
                }

                match response.last_evaluated_backup_arn() {
                    Some(next) if !next.is_empty() => {
                        exclusive_start_backup_arn = Some(next.to_string());
                    }
                    _ => break,
                }
            }
            Err(e) => {
                // Use Debug format to surface the underlying transport error —
                // `message()` collapses SdkError::DispatchFailure to a generic
                // "dispatch failure" and hides the real connection cause.
                let error_code = e.code().unwrap_or("UnknownError").to_string();
                let error_message = format!("{:?}", e);
                return Ok(ApiResponse {
                    status: 500,
                    message: format!("Failed to list backups: [{}] {}", error_code, error_message),
                    data: None,
                });
            }
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: "Backups listed successfully".to_string(),
        data: Some(json!({ "backups": all_backups })),
    })
}
