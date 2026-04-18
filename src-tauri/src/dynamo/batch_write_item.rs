use crate::common::dynamodb_utils::convert_json_to_attr_value;
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
            if let Some(attributes) = item_json.get("attributes").and_then(|v| v.as_array()) {
                let mut item_map: HashMap<String, aws_sdk_dynamodb::types::AttributeValue> =
                    HashMap::new();

                for attr in attributes {
                    if let (Some(key), Some(value), Some(attr_type)) = (
                        attr.get("key").and_then(|v| v.as_str()),
                        attr.get("value"),
                        attr.get("type").and_then(|v| v.as_str()),
                    ) {
                        if let Some(av) = convert_json_to_attr_value(value, attr_type) {
                            item_map.insert(key.to_string(), av);
                        }
                    }
                }

                if !item_map.is_empty() {
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
                } else {
                    chunk_skipped += 1;
                }
            } else {
                chunk_skipped += 1;
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

fn convert_item_to_json(
    _table_name: &str,
    put_request: &PutRequest,
) -> serde_json::Value {
    use crate::common::dynamodb_utils::convert_attr_value_to_json;

    let item = put_request.item();
    let json_item: serde_json::Map<String, Value> = item
        .iter()
        .map(|(k, v): (&String, &aws_sdk_dynamodb::types::AttributeValue)| {
            (k.clone(), convert_attr_value_to_json(v))
        })
        .collect();

    serde_json::json!({
        "attributes": json_item
    })
}