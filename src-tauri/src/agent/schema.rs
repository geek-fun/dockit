use serde_json::{json, Value};

use super::executor::{build_es_base_url, build_es_headers, create_dynamo_client, create_mongo_client_from_config, get_es_ssl_flag};
use crate::common::http_client::create_http_client;
use crate::dynamo::describe_table::describe_table;
use futures::TryStreamExt;
use mongodb::bson::Document;

async fn introspect_es(config: &Value) -> Result<String, String> {
    let base_url = build_es_base_url(config)?;
    let headers = build_es_headers(config);
    let ssl = get_es_ssl_flag(config);
    let client = create_http_client("system", None, Some(ssl), None);

    let indices_url = format!("{}/_cat/indices?format=json", base_url);
    let indices_resp = client
        .get(&indices_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Failed to fetch indices: {}", e))?;
    if !indices_resp.status().is_success() {
        let status = indices_resp.status();
        let body = indices_resp.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to fetch indices: HTTP {} - {}",
            status, body
        ));
    }
    let indices_body = indices_resp.text().await.map_err(|e| e.to_string())?;
    let indices: Vec<Value> = serde_json::from_str(&indices_body)
        .map_err(|e| format!("Failed to parse indices response: {}", e))?;

    let index_names: Vec<String> = indices
        .iter()
        .filter_map(|i| {
            i.get("index")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .filter(|name| !name.starts_with('.'))
        .take(20)
        .collect();

    let mut mappings = json!({});
    for index_name in &index_names {
        let mapping_url = format!("{}/{}/_mapping", base_url, index_name);
        if let Ok(resp) = client
            .get(&mapping_url)
            .headers(headers.clone())
            .send()
            .await
        {
            if let Ok(body) = resp.text().await {
                if let Ok(mapping) = serde_json::from_str::<Value>(&body) {
                    mappings[index_name] = mapping;
                }
            }
        }
    }

    let visible_indices: Vec<&Value> = indices
        .iter()
        .filter(|i| {
            i.get("index")
                .and_then(|v| v.as_str())
                .map(|name| !name.starts_with('.'))
                .unwrap_or(false)
        })
        .take(20)
        .collect();

    let schema = json!({
        "indices": visible_indices,
        "mappings": mappings
    });

    Ok(schema.to_string())
}

async fn introspect_dynamo(config: &Value) -> Result<String, String> {
    let table_name = config
        .get("tableName")
        .and_then(|v| v.as_str())
        .ok_or("Missing tableName")?;
    let client = create_dynamo_client(config).await?;
    let response = describe_table(&client, table_name).await?;
    serde_json::to_string(&response).map_err(|e| e.to_string())
}

async fn introspect_mongo(config: &Value) -> Result<String, String> {
    let (client, db_name) = create_mongo_client_from_config(config).await?;
    let db = client.database(&db_name);

    let collection_names = db
        .list_collection_names()
        .await
        .map_err(|e| format!("Failed to list collections: {}", e))?;

    let mut collections_schema = serde_json::Map::new();
    for name in collection_names.iter().take(20) {
        let coll = db.collection::<Document>(name);
        let mut cursor = coll
            .find(mongodb::bson::doc! {})
            .limit(5)
            .await
            .map_err(|e| format!("Failed to sample {}: {}", name, e))?;
        let mut fields: std::collections::HashSet<String> = std::collections::HashSet::new();
        while let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| format!("cursor error: {}", e))?
        {
            for key in doc.keys() {
                fields.insert(key.clone());
            }
        }
        let mut field_list: Vec<String> = fields.into_iter().collect();
        field_list.sort();
        collections_schema.insert(name.clone(), json!(field_list));
    }

    let schema = json!({
        "database": db_name,
        "collections": collection_names,
        "sample_fields": collections_schema
    });

    Ok(schema.to_string())
}

#[tauri::command]
pub async fn introspect_schema(
    connection_config: serde_json::Value,
    database_type: String,
) -> Result<String, String> {
    match database_type.as_str() {
        "ELASTICSEARCH" | "OPENSEARCH" | "EASYSEARCH" => introspect_es(&connection_config).await,
        "DYNAMODB" => introspect_dynamo(&connection_config).await,
        "MONGODB" => introspect_mongo(&connection_config).await,
        _ => Err(format!("Unknown database type: {}", database_type)),
    }
}
