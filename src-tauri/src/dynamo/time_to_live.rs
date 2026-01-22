use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_time_to_live(
    client: &Client,
    table_name: &str,
) -> Result<ApiResponse, String> {
    match client
        .describe_time_to_live()
        .table_name(table_name)
        .send()
        .await
    {
        Ok(output) => {
            let ttl_description = output.time_to_live_description();
            
            let ttl_enabled = ttl_description
                .and_then(|desc| desc.time_to_live_status())
                .map(|status| status.as_str() == "ENABLED")
                .unwrap_or(false);
            
            let attribute_name = ttl_description
                .and_then(|desc| desc.attribute_name())
                .map(|s| s.to_string());

            Ok(ApiResponse {
                status: 200,
                message: "Success".to_string(),
                data: Some(json!({
                    "ttlEnabled": ttl_enabled,
                    "attributeName": attribute_name,
                })),
            })
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to describe time to live: {}", e),
            data: None,
        }),
    }
}
