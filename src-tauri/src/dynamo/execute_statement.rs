use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::Client;
use serde_json::{json, Value};

/// Input for PartiQL statement execution
pub struct ExecuteStatementInput<'a> {
    pub statement: &'a str,
    pub next_token: Option<&'a str>,
    pub limit: Option<i32>,
}

/// Convert DynamoDB AttributeValue to JSON
fn attribute_value_to_json(av: &aws_sdk_dynamodb::types::AttributeValue) -> Value {
    match av {
        aws_sdk_dynamodb::types::AttributeValue::S(s) => json!(s),
        aws_sdk_dynamodb::types::AttributeValue::N(n) => {
            // Try to parse as integer first, then as float
            if let Ok(i) = n.parse::<i64>() {
                json!(i)
            } else if let Ok(f) = n.parse::<f64>() {
                json!(f)
            } else {
                json!(n)
            }
        }
        aws_sdk_dynamodb::types::AttributeValue::Bool(b) => json!(b),
        aws_sdk_dynamodb::types::AttributeValue::Null(_) => Value::Null,
        aws_sdk_dynamodb::types::AttributeValue::M(m) => {
            let obj: serde_json::Map<String, Value> = m
                .iter()
                .map(|(k, v)| (k.clone(), attribute_value_to_json(v)))
                .collect();
            Value::Object(obj)
        }
        aws_sdk_dynamodb::types::AttributeValue::L(l) => {
            Value::Array(l.iter().map(attribute_value_to_json).collect())
        }
        aws_sdk_dynamodb::types::AttributeValue::Ss(ss) => {
            Value::Array(ss.iter().map(|s| json!(s)).collect())
        }
        aws_sdk_dynamodb::types::AttributeValue::Ns(ns) => {
            Value::Array(ns.iter().map(|n| {
                if let Ok(i) = n.parse::<i64>() {
                    json!(i)
                } else if let Ok(f) = n.parse::<f64>() {
                    json!(f)
                } else {
                    json!(n)
                }
            }).collect())
        }
        aws_sdk_dynamodb::types::AttributeValue::B(b) => {
            json!(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b.as_ref()))
        }
        aws_sdk_dynamodb::types::AttributeValue::Bs(bs) => {
            Value::Array(
                bs.iter()
                    .map(|b| json!(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, b.as_ref())))
                    .collect(),
            )
        }
        _ => Value::Null,
    }
}

/// Convert DynamoDB item to JSON object
fn item_to_json(item: &std::collections::HashMap<String, aws_sdk_dynamodb::types::AttributeValue>) -> Value {
    let obj: serde_json::Map<String, Value> = item
        .iter()
        .map(|(k, v)| (k.clone(), attribute_value_to_json(v)))
        .collect();
    Value::Object(obj)
}

/// Execute a PartiQL statement against DynamoDB
pub async fn execute_statement(
    client: &Client,
    input: ExecuteStatementInput<'_>,
) -> Result<ApiResponse, String> {
    let mut request = client
        .execute_statement()
        .statement(input.statement);

    // Add pagination token if provided
    if let Some(token) = input.next_token {
        if !token.is_empty() {
            request = request.next_token(token);
        }
    }

    // Add limit if provided
    if let Some(limit) = input.limit {
        request = request.limit(limit);
    }

    match request.send().await {
        Ok(output) => {
            let items: Vec<Value> = output
                .items()
                .iter()
                .map(|item| item_to_json(item))
                .collect();

            let count = items.len();
            let next_token = output.next_token().map(|s| s.to_string());

            Ok(ApiResponse {
                status: 200,
                message: "Success".to_string(),
                data: Some(json!({
                    "items": items,
                    "count": count,
                    "next_token": next_token,
                })),
            })
        }
        Err(e) => {
            let error_message = format!("PartiQL execution failed: {}", e);
            Ok(ApiResponse {
                status: 400,
                message: error_message,
                data: None,
            })
        }
    }
}
