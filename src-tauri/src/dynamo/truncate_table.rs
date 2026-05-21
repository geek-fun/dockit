use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{DeleteRequest, KeySchemaElement, WriteRequest};
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;

const MAX_BATCH_SIZE: usize = 25;
const MAX_RETRIES: u32 = 8;
const BASE_BACKOFF_MS: u64 = 10;

pub async fn truncate_table(client: &Client, table_name: &str) -> Result<ApiResponse, String> {
    let describe_result = client.describe_table().table_name(table_name).send().await;

    let key_schema: Vec<KeySchemaElement> = match describe_result {
        Ok(resp) => {
            let table_desc = resp.table().ok_or("Table description not found")?;
            table_desc.key_schema().iter().map(|k| k.clone()).collect()
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
                    "Failed to describe table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            });
        }
    };

    if key_schema.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: format!("Table '{}' has no key schema", table_name),
            data: None,
        });
    }

    let key_attribute_names: Vec<String> = key_schema
        .iter()
        .map(|k| k.attribute_name().to_string())
        .collect();

    let mut all_keys: Vec<HashMap<String, aws_sdk_dynamodb::types::AttributeValue>> = Vec::new();
    let mut exclusive_start_key: Option<HashMap<String, aws_sdk_dynamodb::types::AttributeValue>> =
        None;
    let mut total_scanned: u64 = 0;

    loop {
        let mut scan_request = client.scan().table_name(table_name).limit(1000);

        let mut projection_parts: Vec<String> = Vec::new();
        let mut expr_attr_names: HashMap<String, String> = HashMap::new();

        for (i, attr_name) in key_attribute_names.iter().enumerate() {
            let placeholder = format!("#key{}", i);
            projection_parts.push(placeholder.clone());
            expr_attr_names.insert(placeholder, attr_name.clone());
        }

        let projection_expr = projection_parts.join(",");
        scan_request = scan_request
            .projection_expression(projection_expr)
            .set_expression_attribute_names(Some(expr_attr_names));

        if let Some(start_key) = exclusive_start_key.take() {
            for (key, value) in start_key {
                scan_request = scan_request.exclusive_start_key(key, value);
            }
        }

        let scan_result = scan_request.send().await;

        match scan_result {
            Ok(resp) => {
                let items = resp.items();
                total_scanned += resp.scanned_count() as u64;

                for item in items {
                    let mut key_map: HashMap<String, aws_sdk_dynamodb::types::AttributeValue> =
                        HashMap::new();
                    for attr_name in &key_attribute_names {
                        if let Some(value) = item.get(attr_name) {
                            key_map.insert(attr_name.clone(), value.clone());
                        }
                    }
                    if !key_map.is_empty() {
                        all_keys.push(key_map);
                    }
                }

                match resp.last_evaluated_key() {
                    Some(next_key) if !next_key.is_empty() => {
                        exclusive_start_key = Some(next_key.clone());
                    }
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
                        "Failed to scan table '{}': [{}] {}",
                        table_name, error_code, error_message
                    ),
                    data: Some(json!({
                        "totalScanned": total_scanned,
                        "errorPhase": "scan",
                    })),
                });
            }
        }
    }

    if all_keys.is_empty() {
        return Ok(ApiResponse {
            status: 200,
            message: format!("Table '{}' is already empty", table_name),
            data: Some(json!({
                "totalItems": 0,
                "totalScanned": total_scanned,
                "deletedItems": 0,
                "unprocessedCount": 0,
                "errors": [],
            })),
        });
    }

    let mut total_deleted: u64 = 0;
    let mut errors: Vec<Value> = Vec::new();
    let mut final_unprocessed_count: u64 = 0;

    for chunk in all_keys.chunks(MAX_BATCH_SIZE) {
        let chunk_size = chunk.len();
        let mut request_items: HashMap<String, Vec<WriteRequest>> = HashMap::new();
        let mut write_requests: Vec<WriteRequest> = Vec::new();

        for key_map in chunk {
            let delete_request = DeleteRequest::builder()
                .set_key(Some(key_map.clone()))
                .build();

            match delete_request {
                Ok(dr) => {
                    let write_request = WriteRequest::builder().delete_request(dr).build();
                    write_requests.push(write_request);
                }
                Err(e) => {
                    errors.push(json!({
                        "error": "FailedToBuildDeleteRequest",
                        "message": e.to_string(),
                    }));
                }
            }
        }

        request_items.insert(table_name.to_string(), write_requests);

        let mut retry_count = 0;
        let mut current_request_items = request_items.clone();
        let mut items_remaining = chunk_size;

        while retry_count <= MAX_RETRIES {
            let batch_result = client
                .batch_write_item()
                .set_request_items(Some(current_request_items.clone()))
                .send()
                .await;

            match batch_result {
                Ok(resp) => match resp.unprocessed_items() {
                    Some(unprocessed) if unprocessed.is_empty() => {
                        total_deleted += chunk_size as u64;
                        items_remaining = 0;
                        break;
                    }
                    Some(unprocessed) => {
                        let unprocessed_table_items = unprocessed.get(table_name);
                        if let Some(items) = unprocessed_table_items {
                            if items.is_empty() {
                                total_deleted += chunk_size as u64;
                                items_remaining = 0;
                                break;
                            }
                            items_remaining = items.len();

                            current_request_items = HashMap::new();
                            current_request_items.insert(table_name.to_string(), items.clone());

                            retry_count += 1;
                            if retry_count <= MAX_RETRIES {
                                let backoff_ms = BASE_BACKOFF_MS * (2_u64.pow(retry_count));
                                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                            }
                        } else {
                            total_deleted += chunk_size as u64;
                            items_remaining = 0;
                            break;
                        }
                    }
                    None => {
                        total_deleted += chunk_size as u64;
                        items_remaining = 0;
                        break;
                    }
                },
                Err(e) => {
                    let error_code = e.code().unwrap_or("UnknownError").to_string();
                    let error_message = e
                        .message()
                        .map(|m| m.to_string())
                        .unwrap_or_else(|| format!("{:#}", e));

                    errors.push(json!({
                        "error": error_code,
                        "message": error_message,
                        "retryAttempt": retry_count,
                    }));

                    retry_count += 1;
                    if retry_count <= MAX_RETRIES {
                        let backoff_ms = BASE_BACKOFF_MS * (2_u64.pow(retry_count));
                        tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                    } else {
                        errors.push(json!({
                            "error": "MaxRetriesExceeded",
                            "message": format!("Failed after {} retries", MAX_RETRIES),
                            "unprocessedItems": items_remaining,
                        }));
                    }
                }
            }
        }

        if items_remaining > 0 {
            final_unprocessed_count += items_remaining as u64;
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: if errors.is_empty() {
            format!(
                "Table '{}' truncated successfully. Deleted {} items.",
                table_name, total_deleted
            )
        } else {
            format!(
                "Table '{}' truncated with some errors. Deleted {} items, {} errors.",
                table_name,
                total_deleted,
                errors.len()
            )
        },
        data: Some(json!({
            "totalItems": all_keys.len(),
            "totalScanned": total_scanned,
            "deletedItems": total_deleted,
            "unprocessedCount": final_unprocessed_count,
            "errors": errors,
        })),
    })
}
