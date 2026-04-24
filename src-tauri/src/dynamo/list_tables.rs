use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn list_tables(client: &Client) -> Result<ApiResponse, String> {
    let mut all_tables: Vec<String> = Vec::new();
    let mut exclusive_start_table_name: Option<String> = None;

    loop {
        let mut request = client.list_tables();
        if let Some(start) = exclusive_start_table_name.as_ref() {
            request = request.exclusive_start_table_name(start);
        }

        match request.send().await {
            Ok(response) => {
                let names = response.table_names().to_vec();
                all_tables.extend(names);

                match response.last_evaluated_table_name() {
                    Some(next) if !next.is_empty() => {
                        exclusive_start_table_name = Some(next.to_string());
                    }
                    _ => break,
                }
            }
            Err(e) => {
                let error_code = e.code().unwrap_or("UnknownError").to_string();
                let error_message = e
                    .message()
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| format!("{:#}", e));
                return Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Failed to list tables: [{}] {}",
                        error_code, error_message,
                    ),
                    data: None,
                });
            }
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: "Tables listed successfully".to_string(),
        data: Some(json!({ "tableNames": all_tables })),
    })
}
