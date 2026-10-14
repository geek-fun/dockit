use aws_sdk_dynamodb::types::AttributeValue;
use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::collections::HashMap;

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
        AttributeValue::L(l) => Value::Array(l.iter().map(convert_attr_value_to_json).collect()),
        AttributeValue::Ss(ss) => Value::Array(ss.iter().map(|s| json!(s)).collect()),
        AttributeValue::Ns(ns) => Value::Array(
            ns.iter()
                .map(|n| {
                    if let Ok(i) = n.parse::<i64>() {
                        json!(i)
                    } else if let Ok(f) = n.parse::<f64>() {
                        json!(f)
                    } else {
                        json!(n)
                    }
                })
                .collect(),
        ),
        AttributeValue::B(b) => {
            json!(general_purpose::STANDARD.encode(b.as_ref()))
        }
        AttributeValue::Bs(bs) => Value::Array(
            bs.iter()
                .map(|b| json!(general_purpose::STANDARD.encode(b.as_ref())))
                .collect(),
        ),
        _ => Value::Null,
    }
}

/// Converts a JSON value to a DynamoDB AttributeValue based on the specified type.
/// Supports all DynamoDB attribute types: S, N, B, BOOL, NULL, SS, NS, BS, L, M.
/// For L (List) and M (Map) types, nested values are inferred from their JSON types.
/// Text inputs send structured values as JSON strings, so SS/NS/BS/L/M also accept
/// their JSON-string encoding. Returns Err with a reason so write paths fail
/// loudly instead of dropping invalid attributes silently.
pub fn convert_json_to_attr_value(
    value: &serde_json::Value,
    attr_type: &str,
) -> Result<AttributeValue, String> {
    match attr_type {
        "S" => value
            .as_str()
            .map(|s| AttributeValue::S(s.to_string()))
            .ok_or_else(|| format!("expected a string for type S, got {}", value_preview(value))),
        "N" => json_number_to_string(value)
            .map(AttributeValue::N)
            .ok_or_else(|| format!("expected a number for type N, got {}", value_preview(value))),
        "B" => {
            let s = value.as_str().ok_or_else(|| {
                format!(
                    "expected a base64 string for type B, got {}",
                    value_preview(value)
                )
            })?;
            general_purpose::STANDARD
                .decode(s.trim())
                .map(|bytes| AttributeValue::B(aws_sdk_dynamodb::primitives::Blob::new(bytes)))
                .map_err(|e| format!("invalid base64 for type B: {e}"))
        }
        "BOOL" => {
            // UI may send booleans as "true"/"false" strings (text inputs)
            if let Some(b) = value.as_bool() {
                Ok(AttributeValue::Bool(b))
            } else if let Some(s) = value.as_str() {
                match s.trim().to_ascii_lowercase().as_str() {
                    "true" => Ok(AttributeValue::Bool(true)),
                    "false" => Ok(AttributeValue::Bool(false)),
                    _ => Err(format!("expected a boolean for type BOOL, got '{s}'")),
                }
            } else {
                Err(format!(
                    "expected a boolean for type BOOL, got {}",
                    value_preview(value)
                ))
            }
        }
        "NULL" => Ok(AttributeValue::Null(true)),
        "SS" => {
            let arr = resolve_json_array(value, attr_type)?;
            let items = arr
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    v.as_str().map(|s| s.to_string()).ok_or_else(|| {
                        format!("item {i} of SS must be a string, got {}", value_preview(v))
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(AttributeValue::Ss(items))
        }
        "NS" => {
            let arr = resolve_json_array(value, attr_type)?;
            let items = arr
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    json_number_to_string(v).ok_or_else(|| {
                        format!("item {i} of NS must be a number, got {}", value_preview(v))
                    })
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(AttributeValue::Ns(items))
        }
        "BS" => {
            let arr = resolve_json_array(value, attr_type)?;
            let items = arr
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    let s = v.as_str().ok_or_else(|| {
                        format!(
                            "item {i} of BS must be a base64 string, got {}",
                            value_preview(v)
                        )
                    })?;
                    general_purpose::STANDARD
                        .decode(s.trim())
                        .map(|bytes| aws_sdk_dynamodb::primitives::Blob::new(bytes))
                        .map_err(|e| format!("item {i} of BS is not valid base64: {e}"))
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(AttributeValue::Bs(items))
        }
        "L" => {
            let arr = resolve_json_array(value, attr_type)?;
            Ok(AttributeValue::L(
                arr.iter()
                    .filter_map(|v| infer_attr_value_from_json(v))
                    .collect(),
            ))
        }
        "M" => {
            let resolved = resolve_structured_value(value, attr_type)?;
            let map = resolved.as_object().ok_or_else(|| {
                format!(
                    "expected a JSON object for type M, got {}",
                    value_preview(&resolved)
                )
            })?;
            Ok(AttributeValue::M(
                map.iter()
                    .filter_map(|(k, v)| infer_attr_value_from_json(v).map(|av| (k.clone(), av)))
                    .collect(),
            ))
        }
        _ => Err(format!("unsupported attribute type: {attr_type}")),
    }
}

/// Structured values arrive either as real JSON structures or as their
/// JSON-string encoding from text inputs.
fn resolve_structured_value(value: &serde_json::Value, attr_type: &str) -> Result<Value, String> {
    match value {
        Value::String(s) => serde_json::from_str::<Value>(s.trim())
            .map_err(|e| format!("invalid JSON for type {attr_type}: {e}")),
        other => Ok(other.clone()),
    }
}

fn resolve_json_array(value: &serde_json::Value, attr_type: &str) -> Result<Vec<Value>, String> {
    let resolved = resolve_structured_value(value, attr_type)?;
    resolved.as_array().cloned().ok_or_else(|| {
        format!(
            "expected a JSON array for type {attr_type}, got {}",
            value_preview(&resolved)
        )
    })
}

/// Accepts JSON numbers and numeric strings (the text-input encoding).
fn json_number_to_string(value: &serde_json::Value) -> Option<String> {
    if let Some(n) = value.as_i64() {
        Some(n.to_string())
    } else if let Some(n) = value.as_f64() {
        Some(n.to_string())
    } else if let Some(s) = value.as_str() {
        let trimmed = s.trim();
        trimmed
            .parse::<i64>()
            .ok()
            .map(|n| n.to_string())
            .or_else(|| trimmed.parse::<f64>().ok().map(|n| n.to_string()))
    } else {
        None
    }
}

/// Truncated JSON rendering for error messages.
fn value_preview(value: &serde_json::Value) -> String {
    let serialized = value.to_string();
    if serialized.chars().count() <= 60 {
        serialized
    } else {
        let truncated: String = serialized.chars().take(60).collect();
        format!("{truncated}…")
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

/// Convert JSON object (from exclusive_start_key) to HashMap of AttributeValues
/// Handles basic types: String, Number, Boolean
pub fn json_to_dynamodb_key_map(
    key_map: &serde_json::Map<String, Value>,
) -> HashMap<String, AttributeValue> {
    let mut result = HashMap::new();

    for (k, v) in key_map {
        if let Some(s) = v.as_str() {
            result.insert(k.clone(), AttributeValue::S(s.to_string()));
        } else if let Some(n) = v.as_u64() {
            result.insert(k.clone(), AttributeValue::N(n.to_string()));
        } else if let Some(n) = v.as_i64() {
            result.insert(k.clone(), AttributeValue::N(n.to_string()));
        } else if let Some(b) = v.as_bool() {
            result.insert(k.clone(), AttributeValue::Bool(b));
        }
    }

    result
}

/// Build a filter expression from operator string
/// Returns the expression string with placeholders
pub fn build_filter_expression(
    name_placeholder: &str,
    value_placeholder: &str,
    operator: &str,
) -> String {
    match operator {
        "=" => format!("{} = {}", name_placeholder, value_placeholder),
        "!=" => format!("{} <> {}", name_placeholder, value_placeholder),
        ">" => format!("{} > {}", name_placeholder, value_placeholder),
        ">=" => format!("{} >= {}", name_placeholder, value_placeholder),
        "<" => format!("{} < {}", name_placeholder, value_placeholder),
        "<=" => format!("{} <= {}", name_placeholder, value_placeholder),
        "CONTAINS" | "contains" => format!("contains({}, {})", name_placeholder, value_placeholder),
        "not contains" => format!("not contains({}, {})", name_placeholder, value_placeholder),
        "BEGINS_WITH" | "begins_with" => {
            format!("begins_with({}, {})", name_placeholder, value_placeholder)
        }
        "attribute_exists" => format!("attribute_exists({})", name_placeholder),
        "attribute_not_exists" => format!("attribute_not_exists({})", name_placeholder),
        _ => format!("{} = {}", name_placeholder, value_placeholder), // Default to equals
    }
}

/// Parse a string value into the appropriate AttributeValue type
/// Attempts to detect booleans and numbers, defaults to String
pub fn parse_string_to_attribute_value(value: &str) -> AttributeValue {
    if value.eq_ignore_ascii_case("true") {
        AttributeValue::Bool(true)
    } else if value.eq_ignore_ascii_case("false") {
        AttributeValue::Bool(false)
    } else if let Ok(_) = value.parse::<f64>() {
        AttributeValue::N(value.to_string())
    } else {
        AttributeValue::S(value.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_number_maps_to_n() {
        assert_eq!(
            convert_json_to_attr_value(&json!(42), "N"),
            Ok(AttributeValue::N("42".to_string()))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!(1.5), "N"),
            Ok(AttributeValue::N("1.5".to_string()))
        );
    }

    #[test]
    fn numeric_string_maps_to_n() {
        assert_eq!(
            convert_json_to_attr_value(&json!("42"), "N"),
            Ok(AttributeValue::N("42".to_string()))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!("42.5"), "N"),
            Ok(AttributeValue::N("42.5".to_string()))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!(" 7 "), "N"),
            Ok(AttributeValue::N("7".to_string()))
        );
    }

    #[test]
    fn non_numeric_string_is_rejected() {
        assert!(convert_json_to_attr_value(&json!("abc"), "N").is_err());
        assert!(convert_json_to_attr_value(&json!(true), "N").is_err());
    }

    #[test]
    fn json_bool_maps_to_bool() {
        assert_eq!(
            convert_json_to_attr_value(&json!(true), "BOOL"),
            Ok(AttributeValue::Bool(true))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!(false), "BOOL"),
            Ok(AttributeValue::Bool(false))
        );
    }

    #[test]
    fn bool_string_maps_to_bool() {
        assert_eq!(
            convert_json_to_attr_value(&json!("true"), "BOOL"),
            Ok(AttributeValue::Bool(true))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!("FALSE"), "BOOL"),
            Ok(AttributeValue::Bool(false))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!(" true "), "BOOL"),
            Ok(AttributeValue::Bool(true))
        );
    }

    #[test]
    fn non_bool_string_is_rejected() {
        assert!(convert_json_to_attr_value(&json!("yes"), "BOOL").is_err());
    }

    #[test]
    fn valid_base64_maps_to_b() {
        assert!(convert_json_to_attr_value(&json!("aGVsbG8="), "B").is_ok());
    }

    #[test]
    fn invalid_base64_is_rejected() {
        assert!(convert_json_to_attr_value(&json!("not-base64!"), "B").is_err());
    }

    #[test]
    fn json_array_maps_to_ss() {
        assert_eq!(
            convert_json_to_attr_value(&json!(["a", "b"]), "SS"),
            Ok(AttributeValue::Ss(vec!["a".to_string(), "b".to_string()]))
        );
    }

    #[test]
    fn json_string_encoding_maps_to_ss() {
        assert_eq!(
            convert_json_to_attr_value(&json!("[\"a\", \"b\"]"), "SS"),
            Ok(AttributeValue::Ss(vec!["a".to_string(), "b".to_string()]))
        );
    }

    #[test]
    fn ss_with_non_string_item_is_rejected() {
        assert!(convert_json_to_attr_value(&json!(["a", 1]), "SS").is_err());
    }

    #[test]
    fn ns_accepts_number_items_and_numeric_strings() {
        assert_eq!(
            convert_json_to_attr_value(&json!([1, "2.5"]), "NS"),
            Ok(AttributeValue::Ns(vec!["1".to_string(), "2.5".to_string()]))
        );
    }

    #[test]
    fn json_string_encoding_maps_to_l() {
        assert!(matches!(
            convert_json_to_attr_value(&json!("[1, \"a\", true]"), "L"),
            Ok(AttributeValue::L(_))
        ));
    }

    #[test]
    fn json_string_encoding_maps_to_m() {
        assert!(matches!(
            convert_json_to_attr_value(&json!("{\"k\": 1}"), "M"),
            Ok(AttributeValue::M(_))
        ));
    }

    #[test]
    fn invalid_json_string_is_rejected() {
        assert!(convert_json_to_attr_value(&json!("not json"), "L").is_err());
        assert!(convert_json_to_attr_value(&json!("plain text"), "SS").is_err());
    }

    #[test]
    fn wrong_shape_is_rejected() {
        assert!(convert_json_to_attr_value(&json!({"k": 1}), "L").is_err());
        assert!(convert_json_to_attr_value(&json!([1]), "M").is_err());
    }

    #[test]
    fn unsupported_type_is_rejected() {
        assert!(convert_json_to_attr_value(&json!("x"), "XX").is_err());
    }
}
