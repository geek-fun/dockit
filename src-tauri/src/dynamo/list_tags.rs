use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn list_tags(client: &Client, resource_arn: &str) -> Result<ApiResponse, String> {
    let mut all_tags: Vec<serde_json::Value> = Vec::new();
    let mut next_token: Option<String> = None;

    loop {
        let mut request = client.list_tags_of_resource().resource_arn(resource_arn);
        if let Some(token) = next_token.as_ref() {
            request = request.next_token(token);
        }

        match request.send().await {
            Ok(response) => {
                for tag in response.tags() {
                    all_tags.push(json!({ "key": tag.key(), "value": tag.value() }));
                }

                match response.next_token() {
                    Some(token) if !token.is_empty() => next_token = Some(token.to_string()),
                    _ => break,
                }
            }
            Err(e) => {
                let error_code = e.code().unwrap_or("UnknownError").to_string();
                let error_message = e
                    .message()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| format!("{:#}", e));
                return Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Failed to list tags for '{}': [{}] {}",
                        resource_arn, error_code, error_message
                    ),
                    data: None,
                });
            }
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: "Tags listed successfully".to_string(),
        data: Some(json!({ "tags": all_tags })),
    })
}
