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

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_mock_client(server: &wiremock::MockServer) -> aws_sdk_dynamodb::Client {
        let config = serde_json::json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "test",
            "secretAccessKey": "test",
            "endpointUrl": server.uri(),
        });
        crate::common::dynamo::create_dynamo_client(&config, None)
            .await
            .expect("client creation should succeed")
    }

    fn build_tags() -> Vec<Tag> {
        vec![Tag::builder()
            .key("env")
            .value("prod")
            .build()
            .expect("tag builds")]
    }

    #[tokio::test]
    async fn test_tag_resource_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.TagResource"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let resource_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/users";
        let response = tag_resource(&client, resource_arn, build_tags())
            .await
            .expect("tag_resource should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("Tags applied"));
        let data = response.data.expect("data should be present");
        assert_eq!(data["resourceArn"], resource_arn);
    }

    #[tokio::test]
    async fn test_tag_resource_error_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.TagResource"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let resource_arn = "arn:aws:dynamodb:us-east-1:123456789012:table/users";
        let response = tag_resource(&client, resource_arn, build_tags())
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to tag resource"));
        assert!(response.message.contains("ResourceNotFoundException"));
    }
}
