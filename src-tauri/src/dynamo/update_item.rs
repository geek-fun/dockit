use crate::common::dynamodb_utils::convert_attributes;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::Value;

pub struct UpdateItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

/// Attribute names to REMOVE. Agents may pass them JSON-encoded as a string,
/// matching the other array arguments.
fn removed_attribute_names(payload: &Value) -> Result<Vec<String>, String> {
    let raw = match payload.get("removed") {
        None | Some(Value::Null) => return Ok(Vec::new()),
        Some(value) => value,
    };
    let resolved = match raw {
        Value::String(encoded) => serde_json::from_str::<Value>(encoded.trim())
            .map_err(|e| format!("removed is not valid JSON: {e}"))?,
        other => other.clone(),
    };
    let entries = resolved
        .as_array()
        .ok_or_else(|| "removed must be a JSON array of attribute names".to_string())?;
    let mut names = entries
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .ok_or_else(|| "removed entries must be non-empty attribute names".to_string())
        })
        .collect::<Result<Vec<_>, String>>()?;
    names.sort();
    names.dedup();
    Ok(names)
}

pub async fn update_item(
    client: &Client,
    input: UpdateItemInput<'_>,
) -> Result<ApiResponse, String> {
    // Extract keys from the payload
    let keys = match convert_attributes(input.payload.get("keys"), "") {
        Ok(keys) if keys.is_empty() => {
            return Ok(ApiResponse {
                status: 400,
                message: "At least one key is required for update".to_string(),
                data: None,
            });
        }
        Ok(keys) => keys,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to update item: key {e}"),
                data: None,
            });
        }
    };

    // A removal-only update has no attributes to SET.
    let attributes = if matches!(input.payload.get("attributes"), None | Some(Value::Null)) {
        Vec::new()
    } else {
        match convert_attributes(input.payload.get("attributes"), "") {
            Ok(attributes) => attributes,
            Err(e) => {
                return Ok(ApiResponse {
                    status: 400,
                    message: format!("Failed to update item: {e}"),
                    data: None,
                });
            }
        }
    };

    let removed = match removed_attribute_names(input.payload) {
        Ok(names) => names,
        Err(e) => {
            return Ok(ApiResponse {
                status: 400,
                message: format!("Failed to update item: {e}"),
                data: None,
            });
        }
    };

    if attributes.is_empty() && removed.is_empty() {
        return Ok(ApiResponse {
            status: 400,
            message: "At least one attribute is required for update".to_string(),
            data: None,
        });
    }

    if let Some(name) = removed
        .iter()
        .find(|name| attributes.iter().any(|(key, _)| key == *name))
    {
        return Ok(ApiResponse {
            status: 400,
            message: format!("attribute '{name}' cannot be both updated and removed"),
            data: None,
        });
    }

    // Build the update request
    let mut update_item = client.update_item().table_name(input.table_name);

    for (key, value) in keys {
        update_item = update_item.key(key, value);
    }

    // Build update expression and expression attribute values
    let mut set_parts: Vec<String> = Vec::new();
    let mut remove_parts: Vec<String> = Vec::new();
    let mut expression_attribute_names: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut expression_attribute_values: std::collections::HashMap<String, AttributeValue> =
        std::collections::HashMap::new();

    for (index, (key, value)) in attributes.into_iter().enumerate() {
        let name_placeholder = format!("#attr{}", index);
        let value_placeholder = format!(":val{}", index);

        expression_attribute_names.insert(name_placeholder.clone(), key);

        expression_attribute_values.insert(value_placeholder.clone(), value);
        set_parts.push(format!("{} = {}", name_placeholder, value_placeholder));
    }

    for (index, name) in removed.into_iter().enumerate() {
        let name_placeholder = format!("#rem{}", index);
        expression_attribute_names.insert(name_placeholder.clone(), name);
        remove_parts.push(name_placeholder);
    }

    let update_expression = match (set_parts.is_empty(), remove_parts.is_empty()) {
        (false, false) => format!(
            "SET {} REMOVE {}",
            set_parts.join(", "),
            remove_parts.join(", ")
        ),
        (false, true) => format!("SET {}", set_parts.join(", ")),
        (true, false) => format!("REMOVE {}", remove_parts.join(", ")),
        (true, true) => {
            return Ok(ApiResponse {
                status: 400,
                message: "At least one attribute is required for update".to_string(),
                data: None,
            });
        }
    };

    // Add expression attribute names
    for (placeholder, name) in expression_attribute_names {
        update_item = update_item.expression_attribute_names(placeholder, name);
    }

    // Add expression attribute values
    for (placeholder, value) in expression_attribute_values {
        update_item = update_item.expression_attribute_values(placeholder, value);
    }

    update_item = update_item.update_expression(update_expression);

    match update_item.send().await {
        Ok(_) => Ok(ApiResponse {
            status: 200,
            message: "Item updated successfully".to_string(),
            data: Some(serde_json::json!({})),
        }),
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError");
            let error_message = e.message().unwrap_or("Unknown error occurred");

            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to update item!\n\nError: {}\nDetails: {}",
                    error_code, error_message
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

    #[tokio::test]
    async fn invalid_key_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [
                {"key": "id", "value": "1", "type": "S"},
                {"key": "sk", "value": "nope", "type": "N"}
            ],
            "attributes": [{"key": "name", "value": "a", "type": "S"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("conversion failure is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(response.message.contains("key attribute 'sk'"));
    }

    #[tokio::test]
    async fn invalid_attribute_returns_400_after_a_valid_one() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [
                {"key": "name", "value": "a", "type": "S"},
                {"key": "age", "value": "x", "type": "N"}
            ]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("conversion failure is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(response.message.contains("attribute 'age'"));
        assert!(response.message.contains("expected a number"));
    }

    #[tokio::test]
    async fn string_encoded_values_reach_the_update_expression() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.UpdateItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;
        let client = make_mock_client(&server).await;

        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [
                {"key": "age", "value": "42", "type": "N"},
                {"key": "enabled", "value": "false", "type": "BOOL"}
            ]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("update_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1, "expected exactly one UpdateItem request");
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("request body is JSON");

        assert_eq!(body["Key"]["id"]["S"], "1");
        assert_eq!(body["ExpressionAttributeNames"]["#attr0"], "age");
        assert_eq!(body["ExpressionAttributeNames"]["#attr1"], "enabled");
        assert_eq!(body["ExpressionAttributeValues"][":val0"]["N"], "42");
        assert_eq!(body["ExpressionAttributeValues"][":val1"]["BOOL"], false);
        assert_eq!(
            body["UpdateExpression"],
            "SET #attr0 = :val0, #attr1 = :val1".to_string()
        );
    }

    #[tokio::test]
    async fn attribute_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [{"key": "age", "value": "42"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("a missing type is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response.message.contains("attribute 'age' has no 'type'"),
            "{}",
            response.message
        );
    }

    #[tokio::test]
    async fn key_without_type_returns_400_before_send() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1"}],
            "attributes": [{"key": "name", "value": "a", "type": "S"}]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("a missing type is an ApiResponse");

        assert_eq!(response.status, 400);
        assert!(
            response
                .message
                .contains("key attribute 'id' has no 'type'"),
            "{}",
            response.message
        );
    }

    async fn mount_update_ok(server: &wiremock::MockServer) {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.UpdateItem"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(server)
            .await;
    }

    async fn sent_body(server: &wiremock::MockServer) -> serde_json::Value {
        let requests = server.received_requests().await.expect("recorded requests");
        serde_json::from_slice(&requests[0].body).expect("request body is JSON")
    }

    #[tokio::test]
    async fn removals_are_expressed_as_remove_not_set() {
        let server = wiremock::MockServer::start().await;
        mount_update_ok(&server).await;
        let client = make_mock_client(&server).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [{"key": "name", "value": "b", "type": "S"}],
            "removed": ["legacy", "old.value"]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("update_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let body = sent_body(&server).await;
        assert_eq!(
            body["UpdateExpression"],
            "SET #attr0 = :val0 REMOVE #rem0, #rem1".to_string()
        );
        assert_eq!(body["ExpressionAttributeNames"]["#rem0"], "legacy");
        assert_eq!(body["ExpressionAttributeNames"]["#rem1"], "old.value");
        assert_eq!(body["ExpressionAttributeValues"][":val0"]["S"], "b");
    }

    #[tokio::test]
    async fn removal_only_updates_are_allowed() {
        let server = wiremock::MockServer::start().await;
        mount_update_ok(&server).await;
        let client = make_mock_client(&server).await;
        let payload = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "removed": "[\"legacy\"]"
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &payload,
            },
        )
        .await
        .expect("update_item returns an ApiResponse");

        assert_eq!(response.status, 200);
        let body = sent_body(&server).await;
        assert_eq!(body["UpdateExpression"], "REMOVE #rem0".to_string());
        assert_eq!(body["ExpressionAttributeNames"]["#rem0"], "legacy");
        assert!(body["ExpressionAttributeValues"].is_null());
    }

    #[tokio::test]
    async fn empty_updates_and_overlapping_removals_are_rejected() {
        let server = wiremock::MockServer::start().await;
        let client = make_mock_client(&server).await;

        let empty = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [],
            "removed": []
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &empty,
            },
        )
        .await
        .unwrap();
        assert_eq!(response.status, 400);

        let overlapping = serde_json::json!({
            "keys": [{"key": "id", "value": "1", "type": "S"}],
            "attributes": [{"key": "name", "value": "b", "type": "S"}],
            "removed": ["name"]
        });
        let response = update_item(
            &client,
            UpdateItemInput {
                table_name: "users",
                payload: &overlapping,
            },
        )
        .await
        .unwrap();
        assert_eq!(response.status, 400);
        assert!(response
            .message
            .contains("attribute 'name' cannot be both updated and removed"));

        assert!(server.received_requests().await.unwrap().is_empty());
    }
}
