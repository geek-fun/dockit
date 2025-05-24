use crate::dynamo::create_item::{create_item, CreateItemInput};
use crate::dynamo::describe_table::describe_table;
use crate::dynamo::query_table::{query_table, QueryTableInput};
use crate::dynamo::scan_table::{scan_table, ScanTableInput};
use crate::dynamo::types::ApiResponse;
use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use aws_sdk_dynamodb::{config::Credentials, Client};
use base64;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct DynamoCredentials {
    pub region: String,
    pub access_key_id: String,     // AWS access key ID
    pub secret_access_key: String, // AWS secret access key
}

#[derive(Debug, Deserialize)]
pub struct DynamoOptions {
    pub table_name: String,
    pub operation: String,
    pub payload: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn dynamo_api(
    window: tauri::Window,
    credentials: DynamoCredentials,
    options: DynamoOptions,
) -> Result<String, String> {
    // Parse region
    let region_provider = RegionProviderChain::first_try(Region::new(credentials.region.clone()))
        .or_default_provider()
        .or_else("us-east-1");

    // Create credentials provider
    let creds = Credentials::new(
        credentials.access_key_id,
        credentials.secret_access_key,
        None, // session token
        None, // expiry
        //         &options.table_name.clone()
        "dockit-client",
    );

    // Configure AWS SDK
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider)
        .credentials_provider(creds)
        .load()
        .await;

    let client = Client::new(&config);

    // Process operation
    let result = match options.operation.as_str() {
        "DESCRIBE_TABLE" => describe_table(&client, &options.table_name).await,
        "CREATE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = CreateItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                create_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Item payload is required".to_string(),
                    data: None,
                })
            }
        }
        "QUERY_TABLE" => {
            if let Some(payload) = &options.payload {
                let input = QueryTableInput {
                    table_name: &options.table_name,
                    payload,
                };
                query_table(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Query parameters are required".to_string(),
                    data: None,
                })
            }
        }
        "SCAN_TABLE" => {
            // Extract scan parameters from payload
            if let Some(payload) = &options.payload {
                let input = ScanTableInput {
                    table_name: &options.table_name,
                    payload,
                };
                scan_table(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Scan parameters are required".to_string(),
                    data: None,
                })
            }
        }
        // Add more operations as needed
        _ => Ok(ApiResponse {
            status: 400,
            message: format!("Unsupported operation: {}", options.operation),
            data: None,
        }),
    };

    match result {
        Ok(response) => Ok(serde_json::to_string(&response).map_err(|e| e.to_string())?),
        Err(e) => {
            println!("Error: {}", e);
            let error_response = ApiResponse {
                status: 500,
                message: e,
                data: None,
            };
            Ok(serde_json::to_string(&error_response).map_err(|e| e.to_string())?)
        }
    }
}
