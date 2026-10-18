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
            } else if let Ok(u) = n.parse::<u64>() {
                json!(u)
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
                    } else if let Ok(u) = n.parse::<u64>() {
                        json!(u)
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

pub fn item_attribute_types(items: &[HashMap<String, AttributeValue>]) -> Vec<Value> {
    items
        .iter()
        .map(|item| {
            let types: serde_json::Map<String, Value> = item
                .iter()
                .map(|(key, value)| {
                    let kind = match value {
                        AttributeValue::S(_) => "S",
                        AttributeValue::N(_) => "N",
                        AttributeValue::B(_) => "B",
                        AttributeValue::Bool(_) => "BOOL",
                        AttributeValue::Null(_) => "NULL",
                        AttributeValue::Ss(_) => "SS",
                        AttributeValue::Ns(_) => "NS",
                        AttributeValue::Bs(_) => "BS",
                        AttributeValue::L(_) => "L",
                        AttributeValue::M(_) => "M",
                        _ => "UNKNOWN",
                    };
                    (key.clone(), json!(kind))
                })
                .collect();
            Value::Object(types)
        })
        .collect()
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
            let arr = resolve_set_items(value, attr_type)?;
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
            let arr = resolve_set_items(value, attr_type)?;
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
            let arr = resolve_set_items(value, attr_type)?;
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

/// DynamoDB rejects empty sets ("An string set may not be empty"), so fail here with a
/// message the caller can act on instead of letting the request round-trip to the service.
fn resolve_set_items(value: &serde_json::Value, attr_type: &str) -> Result<Vec<Value>, String> {
    let items = resolve_json_array(value, attr_type)?;
    if items.is_empty() {
        return Err(format!(
            "DynamoDB does not support empty sets (type {attr_type})"
        ));
    }
    Ok(items)
}

/// Agents receive JSON-shaped arguments as strings (the tool schema declares them as
/// `string`), so accept both the structured value and its JSON-string encoding.
pub fn resolve_json_argument(value: &Value) -> Result<Value, String> {
    match value {
        Value::String(encoded) => serde_json::from_str::<Value>(encoded.trim())
            .map_err(|e| format!("expected JSON, got a string that is not valid JSON: {e}")),
        other => Ok(other.clone()),
    }
}

/// Converts the `[{key, value, type}]` payload shared by the UI and the agent tools into
/// ordered `(name, AttributeValue)` pairs.
///
/// Every entry must carry a key, a type and a value: an attribute missing any of them used
/// to be dropped silently, which for a primary key surfaced as an opaque DynamoDB
/// missing-key error and for an update produced a partial write. `context` is appended to
/// the attribute name so batched callers can say which item failed.
pub fn convert_attributes(
    attributes: Option<&Value>,
    context: &str,
) -> Result<Vec<(String, AttributeValue)>, String> {
    let resolved = match attributes {
        None | Some(Value::Null) => return Err("no attributes provided".to_string()),
        Some(Value::String(encoded)) => serde_json::from_str::<Value>(encoded.trim())
            .map_err(|e| format!("attributes is not valid JSON: {e}"))?,
        Some(other) => other.clone(),
    };

    let entries = resolved.as_array().ok_or_else(|| {
        format!(
            "attributes must be a JSON array, got {}",
            value_preview(&resolved)
        )
    })?;

    let attributes = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            if !entry.is_object() {
                return Err(format!(
                    "attribute {index}{context} must be an object with key, value and type"
                ));
            }

            let key = entry
                .get("key")
                .and_then(|v| v.as_str())
                .filter(|key| !key.is_empty())
                .ok_or_else(|| format!("attribute {index}{context} has no 'key'"))?;

            let attr_type = entry
                .get("type")
                .and_then(|v| v.as_str())
                .filter(|attr_type| !attr_type.is_empty())
                .ok_or_else(|| format!("attribute '{key}'{context} has no 'type'"))?;

            let value = entry
                .get("value")
                .ok_or_else(|| format!("attribute '{key}'{context} has no 'value'"))?;

            convert_json_to_attr_value(value, attr_type)
                .map(|av| (key.to_string(), av))
                .map_err(|e| format!("attribute '{key}'{context}: {e}"))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut names = std::collections::HashSet::new();
    for (key, _) in &attributes {
        if !names.insert(key) {
            return Err(format!("duplicate attribute '{key}'{context}"));
        }
    }
    Ok(attributes)
}

/// Accepts JSON numbers and numeric strings (the text-input encoding).
/// Non-finite values (JSON `1e400`, or the strings "Infinity"/"NaN") are rejected:
/// DynamoDB answers those with "A value provided cannot be converted into a number".
fn json_number_to_string(value: &serde_json::Value) -> Option<String> {
    if let Some(n) = value.as_i64() {
        Some(n.to_string())
    } else if let Some(n) = value.as_u64() {
        // Integers above i64::MAX are exactly representable as u64 but not as f64,
        // which would round them (9223372036854775808 -> 9223372036854776000).
        Some(n.to_string())
    } else if let Some(n) = value.as_f64() {
        n.is_finite().then(|| n.to_string())
    } else if let Some(s) = value.as_str() {
        let trimmed = s.trim();
        trimmed
            .parse::<i64>()
            .ok()
            .map(|n| n.to_string())
            .or_else(|| trimmed.parse::<u64>().ok().map(|n| n.to_string()))
            .or_else(|| {
                trimmed
                    .parse::<f64>()
                    .ok()
                    .filter(|n| n.is_finite())
                    .map(|n| n.to_string())
            })
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

    #[test]
    fn string_type_accepts_strings_only() {
        assert_eq!(
            convert_json_to_attr_value(&json!("hello"), "S"),
            Ok(AttributeValue::S("hello".to_string()))
        );
        let err = convert_json_to_attr_value(&json!(1), "S").unwrap_err();
        assert!(err.contains("expected a string"));
    }

    #[test]
    fn binary_trims_base64_and_rejects_non_strings() {
        let av = convert_json_to_attr_value(&json!("  aGVsbG8=  "), "B").unwrap();
        assert_eq!(av.as_b().expect("blob").as_ref(), b"hello");
        let err = convert_json_to_attr_value(&json!(1), "B").unwrap_err();
        assert!(err.contains("expected a base64 string"));
    }

    #[test]
    fn bool_rejects_non_boolean_json() {
        let err = convert_json_to_attr_value(&json!(1), "BOOL").unwrap_err();
        assert!(err.contains("expected a boolean"));
    }

    #[test]
    fn null_type_is_always_null() {
        assert_eq!(
            convert_json_to_attr_value(&json!(null), "NULL"),
            Ok(AttributeValue::Null(true))
        );
    }

    #[test]
    fn integers_keep_full_precision_up_to_u64() {
        assert_eq!(
            convert_json_to_attr_value(&json!(9007199254740993i64), "N"),
            Ok(AttributeValue::N("9007199254740993".to_string()))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!(i64::MAX), "N"),
            Ok(AttributeValue::N(i64::MAX.to_string()))
        );

        let above_i64: Value = serde_json::from_str("9223372036854775808").unwrap();
        assert_eq!(
            convert_json_to_attr_value(&above_i64, "N"),
            Ok(AttributeValue::N("9223372036854775808".to_string()))
        );

        let max_u64: Value = serde_json::from_str("18446744073709551615").unwrap();
        assert_eq!(
            convert_json_to_attr_value(&max_u64, "N"),
            Ok(AttributeValue::N("18446744073709551615".to_string()))
        );

        assert_eq!(
            convert_json_to_attr_value(&json!("-3"), "N"),
            Ok(AttributeValue::N("-3".to_string()))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!("1e2"), "N"),
            Ok(AttributeValue::N("100".to_string()))
        );
    }

    #[test]
    fn integers_beyond_u64_fall_back_to_float_with_precision_loss() {
        let huge: Value = serde_json::from_str("99999999999999999999").unwrap();
        assert_eq!(
            convert_json_to_attr_value(&huge, "N"),
            Ok(AttributeValue::N("100000000000000000000".to_string()))
        );
    }

    #[test]
    fn numeric_string_parsing_matches_the_ui_validator() {
        // Mirrored by the NS sample table in
        // tests/views/editor/dynamo-editor/dynamo-attribute.test.ts.
        for accepted in ["42", "42.5", " 7 ", "+5", ".5", "5.", "1e2", "-3"] {
            assert!(
                convert_json_to_attr_value(&json!(accepted), "N").is_ok(),
                "{accepted} should be accepted as N"
            );
        }
        for rejected in ["0x10", "1_000", "", " "] {
            assert!(
                convert_json_to_attr_value(&json!(rejected), "N").is_err(),
                "{rejected:?} should be rejected as N"
            );
        }
    }

    #[test]
    fn base64_acceptance_matches_the_ui_validator() {
        // Mirrored by the BS sample table in
        // tests/views/editor/dynamo-editor/dynamo-attribute.test.ts. The UI is stricter for
        // the empty string (DynamoDB rejects empty values inside a set), so it is absent here.
        for accepted in ["aGVsbG8=", "abcd", "abc=", "YWJjZA=="] {
            assert!(
                convert_json_to_attr_value(&json!(accepted), "B").is_ok(),
                "{accepted} should be accepted as B"
            );
        }
        for rejected in [
            "aGVsbG8",
            "abc",
            "a==",
            "ab==",
            "aGVsbG9=",
            "====",
            "aGVsbG8=extra",
            "!!!",
        ] {
            assert!(
                convert_json_to_attr_value(&json!(rejected), "B").is_err(),
                "{rejected} should be rejected as B"
            );
        }
    }

    #[test]
    fn long_invalid_value_is_truncated_in_the_error() {
        let long = "x".repeat(80);
        let err = convert_json_to_attr_value(&Value::String(long), "N").unwrap_err();
        assert!(err.contains('…'));
        assert!(err.chars().count() < 120);
    }

    #[test]
    fn ns_rejects_non_numbers_and_accepts_json_strings() {
        let err = convert_json_to_attr_value(&json!([1, true]), "NS").unwrap_err();
        assert!(err.contains("item 1 of NS"));
        assert_eq!(
            convert_json_to_attr_value(&json!("[1, \"2\"]"), "NS"),
            Ok(AttributeValue::Ns(vec!["1".to_string(), "2".to_string()]))
        );
    }

    #[test]
    fn bs_accepts_base64_items_and_json_strings() {
        let av = convert_json_to_attr_value(&json!(["aGVsbG8="]), "BS").unwrap();
        assert_eq!(av.as_bs().expect("blobs")[0].as_ref(), b"hello");
        assert!(convert_json_to_attr_value(&json!("[\"aGVsbG8=\"]"), "BS").is_ok());
    }

    #[test]
    fn bs_rejects_bad_items() {
        let not_string = convert_json_to_attr_value(&json!([1]), "BS").unwrap_err();
        assert!(not_string.contains("item 0 of BS must be a base64 string"));
        let bad = convert_json_to_attr_value(&json!(["!!!"]), "BS").unwrap_err();
        assert!(bad.contains("item 0 of BS is not valid base64"));
        assert!(convert_json_to_attr_value(&json!({"k": 1}), "BS").is_err());
    }

    #[test]
    fn empty_sets_are_rejected_but_empty_lists_and_maps_are_not() {
        for attr_type in ["SS", "NS", "BS"] {
            for value in [json!([]), json!("[]"), json!(" [] ")] {
                let err = convert_json_to_attr_value(&value, attr_type).unwrap_err();
                assert!(err.contains("empty sets"), "{attr_type} {value}: {err}");
            }
        }

        assert!(matches!(
            convert_json_to_attr_value(&json!([]), "L"),
            Ok(AttributeValue::L(items)) if items.is_empty()
        ));
        assert!(matches!(
            convert_json_to_attr_value(&json!({}), "M"),
            Ok(AttributeValue::M(map)) if map.is_empty()
        ));
    }

    #[test]
    fn empty_values_inside_a_set_are_allowed() {
        assert_eq!(
            convert_json_to_attr_value(&json!(["a", ""]), "SS"),
            Ok(AttributeValue::Ss(vec!["a".to_string(), String::new()]))
        );
        assert_eq!(
            convert_json_to_attr_value(&json!([""]), "BS"),
            Ok(AttributeValue::Bs(vec![
                aws_sdk_dynamodb::primitives::Blob::new(Vec::new())
            ]))
        );
    }

    #[test]
    fn non_finite_numbers_are_rejected() {
        // serde_json refuses out-of-range literals, so only strings can carry these.
        for value in ["Infinity", "-Infinity", "NaN", "inf", "1e400", "-1e400"] {
            let err = convert_json_to_attr_value(&json!(value), "N").unwrap_err();
            assert!(err.contains("expected a number"), "{value}: {err}");
            assert!(convert_json_to_attr_value(&json!([value]), "NS").is_err());
        }
    }

    #[test]
    fn convert_attributes_requires_key_type_and_value() {
        let err = convert_attributes(Some(&json!([{"key": "id", "value": "1"}])), "").unwrap_err();
        assert!(err.contains("attribute 'id' has no 'type'"), "{err}");

        let err = convert_attributes(Some(&json!([{"key": "id", "type": "S"}])), "").unwrap_err();
        assert!(err.contains("attribute 'id' has no 'value'"), "{err}");

        let err = convert_attributes(Some(&json!([{"value": "1", "type": "S"}])), "").unwrap_err();
        assert!(err.contains("has no 'key'"), "{err}");

        let err = convert_attributes(Some(&json!([{"key": "", "value": "1", "type": "S"}])), "")
            .unwrap_err();
        assert!(err.contains("has no 'key'"), "{err}");

        let err = convert_attributes(Some(&json!(["nope"])), "").unwrap_err();
        assert!(err.contains("must be an object"), "{err}");

        assert!(convert_attributes(None, "").is_err());
        assert!(convert_attributes(Some(&json!("not json")), "").is_err());
        assert!(convert_attributes(Some(&json!({"k": 1})), "").is_err());
    }

    #[test]
    fn convert_attributes_accepts_json_string_encoding_in_order() {
        let pairs = convert_attributes(
            Some(&json!(
                "[{\"key\":\"a\",\"value\":\"1\",\"type\":\"N\"},{\"key\":\"b\",\"value\":\"x\",\"type\":\"S\"}]"
            )),
            "",
        )
        .unwrap();

        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0].0, "a");
        assert_eq!(pairs[0].1, AttributeValue::N("1".to_string()));
        assert_eq!(pairs[1].0, "b");
        assert_eq!(pairs[1].1, AttributeValue::S("x".to_string()));
    }

    #[test]
    fn convert_attributes_appends_the_caller_context() {
        let err = convert_attributes(
            Some(&json!([{"key": "id", "value": "1"}])),
            " in 'put' at index 2",
        )
        .unwrap_err();
        assert!(
            err.contains("attribute 'id' in 'put' at index 2 has no 'type'"),
            "{err}"
        );
    }

    #[test]
    fn list_and_map_accept_native_json() {
        assert!(matches!(
            convert_json_to_attr_value(&json!([1, {"k": true}, null]), "L"),
            Ok(AttributeValue::L(items)) if items.len() == 3
        ));
        assert!(matches!(
            convert_json_to_attr_value(&json!({"k": [1, null]}), "M"),
            Ok(AttributeValue::M(map)) if map.contains_key("k")
        ));
    }

    #[test]
    fn structured_json_string_is_trimmed() {
        assert!(convert_json_to_attr_value(&json!("  [1]  "), "L").is_ok());
    }
    #[test]
    fn number_strings_above_i64_remain_exact() {
        for value in [
            "9007199254740993",
            "9223372036854775808",
            "18446744073709551615",
        ] {
            assert_eq!(
                convert_json_to_attr_value(&json!(value), "N").unwrap(),
                AttributeValue::N(value.to_string())
            );
            assert_eq!(
                convert_attr_value_to_json(&AttributeValue::N(value.to_string())).to_string(),
                value
            );
        }
    }

    #[test]
    fn duplicate_attributes_fail_before_a_write_is_built() {
        let error = convert_attributes(
            Some(&json!([
                {"key":"id","type":"S","value":"first"}, {"key":"id","type":"S","value":"second"}
            ])),
            " in 'put' at index 0",
        )
        .unwrap_err();
        assert!(error.contains("duplicate attribute 'id' in 'put' at index 0"));
    }

    #[test]
    fn item_type_metadata_keeps_empty_items_in_row_order() {
        assert!(item_attribute_types(&[]).is_empty());
        let items = [
            HashMap::new(),
            HashMap::from([("nil".to_string(), AttributeValue::Null(true))]),
            HashMap::new(),
        ];
        assert_eq!(
            item_attribute_types(&items),
            vec![json!({}), json!({"nil": "NULL"}), json!({})]
        );
    }
}
