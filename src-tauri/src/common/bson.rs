use mongodb::bson::{Bson, Document};
use serde_json::{json, Value};

pub(crate) fn bson_to_value(bson: &Bson) -> Value {
    match bson {
        Bson::Double(v) => json!(*v),
        Bson::String(v) => json!(v),
        Bson::Array(arr) => Value::Array(arr.iter().map(bson_to_value).collect()),
        Bson::Document(d) => {
            let map: serde_json::Map<String, Value> =
                d.iter().map(|(k, v)| (k.clone(), bson_to_value(v))).collect();
            Value::Object(map)
        }
        Bson::Boolean(v) => json!(*v),
        Bson::Null => Value::Null,
        Bson::Int32(v) => json!(*v),
        Bson::Int64(v) => json!(*v),
        Bson::ObjectId(oid) => json!(oid.to_string()),
        Bson::DateTime(dt) => json!(dt.timestamp_millis()),
        other => json!(other.to_string()),
    }
}

pub(crate) fn json_to_bson_doc_agent(val: &Value) -> Result<Document, String> {
    mongodb::bson::to_document(val)
        .map_err(|e| format!("Failed to convert to BSON document: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::oid::ObjectId;
    use mongodb::bson::DateTime;

    #[test]
    fn test_bson_to_value_double() {
        assert_eq!(bson_to_value(&Bson::Double(3.14)), json!(3.14));
    }

    #[test]
    fn test_bson_to_value_string() {
        assert_eq!(bson_to_value(&Bson::String("hello".into())), json!("hello"));
    }

    #[test]
    fn test_bson_to_value_boolean() {
        assert_eq!(bson_to_value(&Bson::Boolean(true)), json!(true));
    }

    #[test]
    fn test_bson_to_value_null() {
        assert_eq!(bson_to_value(&Bson::Null), Value::Null);
    }

    #[test]
    fn test_bson_to_value_int32() {
        assert_eq!(bson_to_value(&Bson::Int32(42)), json!(42));
    }

    #[test]
    fn test_bson_to_value_int64() {
        assert_eq!(bson_to_value(&Bson::Int64(999_999_999)), json!(999_999_999));
    }

    #[test]
    fn test_bson_to_value_object_id() {
        let oid = ObjectId::new();
        let result = bson_to_value(&Bson::ObjectId(oid));
        assert_eq!(result, json!(oid.to_string()));
    }

    #[test]
    fn test_bson_to_value_datetime() {
        let dt = DateTime::now();
        let result = bson_to_value(&Bson::DateTime(dt));
        assert_eq!(result, json!(dt.timestamp_millis()));
    }

    #[test]
    fn test_bson_to_value_array() {
        let bson_arr = Bson::Array(vec![Bson::Int32(1), Bson::String("two".into())]);
        assert_eq!(bson_to_value(&bson_arr), json!([1, "two"]));
    }

    #[test]
    fn test_bson_to_value_document() {
        use mongodb::bson::doc;
        let doc = Bson::Document(doc! { "name": "test", "count": 5 });
        let result = bson_to_value(&doc);
        assert_eq!(result, json!({"name": "test", "count": 5}));
    }

    #[test]
    fn test_bson_to_value_other_arm() {
        // Timestamp has no special case → hits the `other` arm → stringified
        let ts = Bson::Timestamp(mongodb::bson::Timestamp { time: 100, increment: 1 });
        let result = bson_to_value(&ts);
        assert!(result.is_string());
    }

    #[test]
    fn test_json_to_bson_doc_roundtrip() {
        let val = json!({"name": "test", "count": 5, "active": true});
        let doc = json_to_bson_doc_agent(&val).unwrap();
        // Convert back to verify round-trip
        let back = bson_to_value(&Bson::Document(doc));
        assert_eq!(back, val);
    }

    #[test]
    fn test_json_to_bson_doc_nested() {
        let val = json!({"nested": {"a": 1, "b": "two"}});
        let doc = json_to_bson_doc_agent(&val).unwrap();
        let back = bson_to_value(&Bson::Document(doc));
        assert_eq!(back, val);
    }

    #[test]
    fn test_json_to_bson_doc_invalid_type() {
        let val = json!([1, 2, 3]); // array, not object
        let result = json_to_bson_doc_agent(&val);
        assert!(result.is_err());
    }
}
