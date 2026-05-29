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
