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

    #[tokio::test]
    async fn test_list_tags_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.ListTagsOfResource",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Tags": [
                    {"Key": "env", "Value": "prod"},
                    {"Key": "team", "Value": "core"}
                ]
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_tags(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users",
        )
        .await
        .expect("list_tags should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        let tags = data["tags"].as_array().expect("tags should be an array");
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0]["key"], "env");
        assert_eq!(tags[0]["value"], "prod");
        assert_eq!(tags[1]["key"], "team");
        assert_eq!(tags[1]["value"], "core");
    }

    #[tokio::test]
    async fn test_list_tags_success_with_pagination() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        // Has-next page mock mounted FIRST: wiremock gives the first-mounted
        // mock precedence among equal priorities, and up_to_n_times(1) consumes
        // it after one match, so the second request falls through to page 2.
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.ListTagsOfResource",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Tags": [
                    {"Key": "env", "Value": "prod"},
                    {"Key": "team", "Value": "core"}
                ],
                "NextToken": "tok-1"
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.ListTagsOfResource",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "Tags": [
                    {"Key": "tier", "Value": "free"}
                ]
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_tags(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users",
        )
        .await
        .expect("list_tags should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        let tags = data["tags"].as_array().expect("tags should be an array");
        assert_eq!(tags.len(), 3);
        assert_eq!(tags[2]["key"], "tier");
        assert_eq!(tags[2]["value"], "free");
    }

    #[tokio::test]
    async fn test_list_tags_success_empty() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.ListTagsOfResource",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_tags(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users",
        )
        .await
        .expect("list_tags should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        assert_eq!(
            data["tags"]
                .as_array()
                .expect("tags should be an array")
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn test_list_tags_error_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.ListTagsOfResource",
            ))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_tags(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users",
        )
        .await
        .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to list tags"));
        assert!(response.message.contains("ResourceNotFoundException"));
    }
}
