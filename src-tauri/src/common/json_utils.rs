use aws_sdk_dynamodb::types::AttributeValue;
use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};

/// Convert DynamoDB AttributeValue to JSON
pub fn convert_attr_value_to_json(av: &AttributeValue) -> Value {
    match av {
        AttributeValue::S(s) => json!(s),
        AttributeValue::N(n) => {
            // Try to parse as integer first, then as float
            if let Ok(i) = n.parse::<i64>() {
                json!(i)
            } else if let Ok(f) = n.parse::<f64>() {
                json!(f)
            } else {
                json!(n)
            }
        }
        AttributeValue::Bool(b) => json!(b),
        AttributeValue::Null(_) => Value::Null,
        AttributeValue::M(m) => {
            let obj: serde_json::Map<String, Value> = m
                .iter()
                .map(|(k, v)| (k.clone(), convert_attr_value_to_json(v)))
                .collect();
            Value::Object(obj)
        }
        AttributeValue::L(l) => {
            Value::Array(l.iter().map(convert_attr_value_to_json).collect())
        }
        AttributeValue::Ss(ss) => {
            Value::Array(ss.iter().map(|s| json!(s)).collect())
        }
        AttributeValue::Ns(ns) => {
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
        AttributeValue::B(b) => {
            json!(general_purpose::STANDARD.encode(b.as_ref()))
        }
        AttributeValue::Bs(bs) => {
            Value::Array(
                bs.iter()
                    .map(|b| json!(general_purpose::STANDARD.encode(b.as_ref())))
                    .collect(),
            )
        }
        _ => Value::Null,
    }
}

/// Converts a JSON value to a DynamoDB AttributeValue based on the specified type.
/// Supports all DynamoDB attribute types: S, N, B, BOOL, NULL, SS, NS, BS, L, M.
/// For L (List) and M (Map) types, nested values are inferred from their JSON types.
pub fn convert_json_to_attr_value(value: &serde_json::Value, attr_type: &str) -> Option<AttributeValue> {
    match attr_type {
        "S" => value.as_str().map(|s| AttributeValue::S(s.to_string())),
        "N" => {
            // Handle both integer and float numbers
            if let Some(n) = value.as_i64() {
                Some(AttributeValue::N(n.to_string()))
            } else {
                value.as_f64().map(|n| AttributeValue::N(n.to_string()))
            }
        }
        "B" => value.as_str().map(|s| {
            AttributeValue::B(aws_sdk_dynamodb::primitives::Blob::new(
                general_purpose::STANDARD.decode(s).unwrap_or_default(),
            ))
        }),
        "BOOL" => value.as_bool().map(AttributeValue::Bool),
        "NULL" => Some(AttributeValue::Null(true)),
        "SS" => value.as_array().map(|arr| {
            AttributeValue::Ss(
                arr.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect(),
            )
        }),
        "NS" => value.as_array().map(|arr| {
            AttributeValue::Ns(
                arr.iter()
                    .filter_map(|v| {
                        if let Some(n) = v.as_i64() {
                            Some(n.to_string())
                        } else {
                            v.as_f64().map(|n| n.to_string())
                        }
                    })
                    .collect(),
            )
        }),
        "BS" => value.as_array().map(|arr| {
            AttributeValue::Bs(
                arr.iter()
                    .filter_map(|v| {
                        v.as_str().map(|s| {
                            aws_sdk_dynamodb::primitives::Blob::new(
                                general_purpose::STANDARD.decode(s).unwrap_or_default(),
                            )
                        })
                    })
                    .collect(),
            )
        }),
        "L" => value.as_array().map(|arr| {
            AttributeValue::L(
                arr.iter()
                    .filter_map(|v| infer_attr_value_from_json(v))
                    .collect(),
            )
        }),
        "M" => value.as_object().map(|map| {
            AttributeValue::M(
                map.iter()
                    .filter_map(|(k, v)| infer_attr_value_from_json(v).map(|av| (k.clone(), av)))
                    .collect(),
            )
        }),
        _ => None,
    }
}

/// Infers a DynamoDB AttributeValue from a JSON value without explicit type.
/// Used for nested values in List and Map types.
fn infer_attr_value_from_json(value: &serde_json::Value) -> Option<AttributeValue> {
    match value {
        serde_json::Value::String(s) => Some(AttributeValue::S(s.clone())),
        serde_json::Value::Number(n) => Some(AttributeValue::N(n.to_string())),
        serde_json::Value::Bool(b) => Some(AttributeValue::Bool(*b)),
        serde_json::Value::Null => Some(AttributeValue::Null(true)),
        serde_json::Value::Array(arr) => Some(AttributeValue::L(
            arr.iter()
                .filter_map(|v| infer_attr_value_from_json(v))
                .collect(),
        )),
        serde_json::Value::Object(map) => Some(AttributeValue::M(
            map.iter()
                .filter_map(|(k, v)| infer_attr_value_from_json(v).map(|av| (k.clone(), av)))
                .collect(),
        )),
    }
}
