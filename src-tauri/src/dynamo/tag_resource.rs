use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::Tag;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn tag_resource(
    client: &Client,
    resource_arn: &str,
    tags: Vec<Tag>,
) -> Result<ApiResponse, String> {
    let mut request = client.tag_resource().resource_arn(resource_arn);
    for tag in tags {
        request = request.tags(tag);
    }

    match request.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: format!("Tags applied to '{}' successfully", resource_arn),
            data: Some(json!({ "resourceArn": resource_arn })),
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
                    "Failed to tag resource '{}': [{}] {}",
                    resource_arn, error_code, error_message
                ),
                data: None,
            })
        }
    }
}
