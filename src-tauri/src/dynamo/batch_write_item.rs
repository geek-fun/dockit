use crate::common::dynamodb_utils::convert_attributes;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{PutRequest, WriteRequest};
use aws_sdk_dynamodb::Client;
use serde_json::Value;
use std::collections::HashMap;

pub struct BatchWriteInput<'a> {
    pub table_name: &'a str,
    pub items: &'a Vec<Value>,
}

pub async fn batch_write_item(
    client: &Client,
    input: BatchWriteInput<'_>,
) -> Result<ApiResponse, String> {
    let max_batch_size = 25;

    if input.items.is_empty() {
        return Ok(ApiResponse {
            status: 200,
            message: "No items to write".to_string(),
            data: Some(serde_json::json!({
                "inserted": 0,
                "skipped": 0,
                "errors": []
            })),
        });
    }

    let mut total_inserted = 0;
    let mut total_skipped = 0;
    let mut total_errors: Vec<serde_json::Value> = Vec::new();
    let mut unprocessed_items: Vec<Value> = Vec::new();

    for chunk in input.items.chunks(max_batch_size) {
        let mut request_items: HashMap<String, Vec<WriteRequest>> = HashMap::new();
        let mut write_requests: Vec<WriteRequest> = Vec::new();
        let mut chunk_skipped = 0usize;

        for item_json in chunk {
            match convert_attributes(item_json.get("attributes"), "") {
                Ok(attributes) if attributes.is_empty() => {
                    total_errors.push(serde_json::json!({
                        "error": "Invalid item",
                        "message": "item has no attributes",
                    }));
                    chunk_skipped += 1;
                }
                Ok(attributes) => {
                    let item_map: HashMap<String, aws_sdk_dynamodb::types::AttributeValue> =
                        attributes.into_iter().collect();
                    let put_request = PutRequest::builder().set_item(Some(item_map)).build();

                    match put_request {
                        Ok(pr) => {
                            let write_request = WriteRequest::builder().put_request(pr).build();
                            write_requests.push(write_request);
                        }
                        Err(e) => {
                            total_errors.push(serde_json::json!({
                                "error": "Failed to build PutRequest",
                                "details": e.to_string()
                            }));
                            chunk_skipped += 1;
                        }
                    }
                }
                Err(e) => {
                    total_errors.push(serde_json::json!({
                        "error": "Invalid attribute value",
                        "message": e,
                    }));
                    chunk_skipped += 1;
                }
            }
        }
        total_skipped += chunk_skipped;

        if !write_requests.is_empty() {
            request_items.insert(input.table_name.to_string(), write_requests);

            let batch_result = client
                .batch_write_item()
                .set_request_items(Some(request_items))
                .send()
                .await;

            match batch_result {
                Ok(response) => {
                    let request_count = chunk.len();
                    let unprocessed_count = response
                        .unprocessed_items
                        .as_ref()
                        .and_then(|ui| ui.get(input.table_name))
                        .map(|items| items.len())
                        .unwrap_or(0);

                    if let Some(ui) = response.unprocessed_items.as_ref() {
                        if let Some(table_items) = ui.get(input.table_name) {
                            for write_req in table_items {
                                if let Some(pr) = write_req.put_request() {
                                    let unprocessed_json =
                                        convert_item_to_json(input.table_name, pr);
                                    unprocessed_items.push(unprocessed_json);
                                }
                            }
                        }
                    }

                    let successful = request_count - unprocessed_count - chunk_skipped;
                    total_inserted += successful;
                    total_skipped += unprocessed_count;
                }
                Err(e) => {
                    let error_code = e.code().unwrap_or("UnknownError");
                    let error_message = e.message().unwrap_or("Unknown error occurred");

                    total_errors.push(serde_json::json!({
                        "error": error_code,
                        "message": error_message,
                        "batch_size": chunk.len()
                    }));
                    total_skipped += chunk.len() - chunk_skipped;
                }
            }
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: format!(
            "Batch write completed: {} inserted, {} skipped, {} errors",
            total_inserted,
            total_skipped,
            total_errors.len()
        ),
        data: Some(serde_json::json!({
            "inserted": total_inserted,
            "skipped": total_skipped,
            "error_count": total_errors.len(),
            "errors": total_errors,
            "unprocessed_items": unprocessed_items,
            "unprocessed_count": unprocessed_items.len()
        })),
    })
}

fn convert_item_to_json(_table_name: &str, put_request: &PutRequest) -> serde_json::Value {
    use crate::common::dynamodb_utils::convert_attr_value_to_json;

    let item = put_request.item();
    let json_item: serde_json::Map<String, Value> = item
        .iter()
        .map(
            |(k, v): (&String, &aws_sdk_dynamodb::types::AttributeValue)| {
                (k.clone(), convert_attr_value_to_json(v))
            },
        )
        .collect();

    serde_json::json!({
        "attributes": json_item
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
    async fn invalid_attribute_is_skipped_with_an_error_entry() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let items = vec![serde_json::json!({
            "attributes": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "tags", "value": "nope", "type": "SS"}
            ]
        })];
        let response = batch_write_item(
            &client,
            BatchWriteInput {
                table_name: "users",
                items: &items,
            },
        )
        .await
        .expect("batch write returns an ApiResponse");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data");
        assert_eq!(data["inserted"], 0);
        assert_eq!(data["skipped"], 1);
        assert_eq!(data["error_count"], 1);
        let message = data["errors"][0]["message"].as_str().unwrap();
        assert!(message.contains("attribute 'tags'"));
    }

    #[tokio::test]
    async fn mixed_batch_counts_inserted_skipped_and_errors() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.BatchWriteItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "UnprocessedItems": {}
            })))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let items = vec![
            serde_json::json!({"attributes": [{"key": "id", "value": "1", "type": "N"}]}),
            serde_json::json!({"attributes": [{"key": "id", "value": "2", "type": "N"}]}),
            serde_json::json!({"attributes": [{"key": "id", "value": "3", "type": "N"}, {"key": "tags", "value": "nope", "type": "SS"}]}),
        ];
        let response = batch_write_item(
            &client,
            BatchWriteInput {
                table_name: "users",
                items: &items,
            },
        )
        .await
        .expect("batch write returns an ApiResponse");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data");
        assert_eq!(data["inserted"], 2);
        assert_eq!(data["skipped"], 1);
        assert_eq!(data["error_count"], 1);
        assert_eq!(data["unprocessed_count"], 0);

        // Only the two valid items are sent, and numeric strings keep their N type.
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1);
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("request body is JSON");
        let writes = body["RequestItems"]["users"].as_array().expect("writes");
        assert_eq!(writes.len(), 2);
        assert_eq!(writes[0]["PutRequest"]["Item"]["id"]["N"], "1");
        assert_eq!(writes[1]["PutRequest"]["Item"]["id"]["N"], "2");
    }

    #[tokio::test]
    async fn item_without_attributes_is_reported_not_silently_skipped() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.BatchWriteItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "UnprocessedItems": {}
            })))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let items = vec![
            serde_json::json!({"attributes": [{"key": "id", "value": "1", "type": "N"}]}),
            serde_json::json!({"attributes": [{"key": "id", "value": "2"}]}),
            serde_json::json!({"table": "users"}),
        ];
        let response = batch_write_item(
            &client,
            BatchWriteInput {
                table_name: "users",
                items: &items,
            },
        )
        .await
        .expect("batch write returns an ApiResponse");

        let data = response.data.expect("data");
        assert_eq!(data["inserted"], 1);
        assert_eq!(data["skipped"], 2);
        assert_eq!(data["error_count"], 2);

        let messages: Vec<&str> = data["errors"]
            .as_array()
            .expect("errors")
            .iter()
            .map(|e| e["message"].as_str().unwrap_or_default())
            .collect();
        assert!(
            messages.iter().any(|m| m.contains("has no 'type'")),
            "{messages:?}"
        );
        assert!(
            messages
                .iter()
                .any(|m| m.contains("no attributes provided")),
            "{messages:?}"
        );
    }
}
