use aws_sdk_dynamodb::types::AttributeValue;

pub fn convert_json_to_attr_value(value: &serde_json::Value) -> Option<AttributeValue> {
    match value {
        serde_json::Value::String(s) => Some(AttributeValue::S(s.clone())),
        serde_json::Value::Number(n) => Some(AttributeValue::N(n.to_string())),
        serde_json::Value::Bool(b) => Some(AttributeValue::Bool(*b)),
        serde_json::Value::Null => Some(AttributeValue::Null(true)),
        serde_json::Value::Array(arr) => Some(AttributeValue::L(
            arr.iter()
                .filter_map(|v| convert_json_to_attr_value(v))
                .collect(),
        )),
        serde_json::Value::Object(map) => Some(AttributeValue::M(
            map.iter()
                .filter_map(|(k, v)| convert_json_to_attr_value(v).map(|av| (k.clone(), av)))
                .collect(),
        )),
    }
}
