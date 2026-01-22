use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_continuous_backups(
    client: &Client,
    table_name: &str,
) -> Result<ApiResponse, String> {
    match client
        .describe_continuous_backups()
        .table_name(table_name)
        .send()
        .await
    {
        Ok(output) => {
            let pitr_enabled = output
                .continuous_backups_description()
                .and_then(|desc| desc.point_in_time_recovery_description())
                .and_then(|pitr| pitr.point_in_time_recovery_status())
                .map(|status| status.as_str() == "ENABLED")
                .unwrap_or(false);

            Ok(ApiResponse {
                status: 200,
                message: "Success".to_string(),
                data: Some(json!({
                    "pitrEnabled": pitr_enabled,
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to describe continuous backups: {}", e),
            data: None,
        }),
    }
}
