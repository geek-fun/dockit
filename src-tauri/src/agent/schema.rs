use serde_json::{json, Value};

use super::executor::{
    build_es_base_url, build_es_headers, create_dynamo_client, get_es_ssl_flag,
};
use crate::common::http_client::create_http_client;
use crate::dynamo::describe_table::describe_table;

async fn introspect_es(config: &Value) -> Result<String, String> {
    let base_url = build_es_base_url(config)?;
    let headers = build_es_headers(config);
    let ssl = get_es_ssl_flag(config);
    let client = create_http_client(None, Some(ssl));

    let indices_url = format!("{}/_cat/indices?format=json", base_url);
    let indices_resp = client
        .get(&indices_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Failed to fetch indices: {}", e))?;
    let indices_body = indices_resp.text().await.map_err(|e| e.to_string())?;
    let indices: Vec<Value> = serde_json::from_str(&indices_body).unwrap_or_default();

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

#[tauri::command]
pub async fn introspect_schema(
    connection_config: serde_json::Value,
    database_type: String,
) -> Result<String, String> {
    match database_type.as_str() {
        "ELASTICSEARCH" => introspect_es(&connection_config).await,
        "DYNAMODB" => introspect_dynamo(&connection_config).await,
        _ => Err(format!("Unknown database type: {}", database_type)),
    }
}
