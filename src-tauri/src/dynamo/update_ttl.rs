use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::TimeToLiveSpecification;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn update_time_to_live(
    client: &Client,
    table_name: &str,
    enabled: bool,
    attribute_name: Option<&str>,
) -> Result<ApiResponse, String> {
    let mut spec_builder = TimeToLiveSpecification::builder().enabled(enabled);

    if let Some(attr_name) = attribute_name {
        spec_builder = spec_builder.attribute_name(attr_name);
    }

    let spec = spec_builder
        .build()
        .map_err(|e| format!("Failed to build TTL specification: {}", e))?;

    match client
        .update_time_to_live()
        .table_name(table_name)
        .time_to_live_specification(spec)
        .send()
        .await
    {
        Ok(response) => {
            let spec = response.time_to_live_specification();
            Ok(ApiResponse {
                status: 200,
                message: format!("TTL updated successfully for table '{}'", table_name),
                data: Some(json!({
                    "tableName": table_name,
                    "enabled": spec.map(|s| s.enabled()).unwrap_or(false),
                    "attributeName": spec.and_then(|s| Some(s.attribute_name())),
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
                    "Failed to update TTL for table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}