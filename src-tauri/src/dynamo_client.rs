use crate::dynamo::create_item::{create_item, CreateItemInput};
use crate::dynamo::delete_item::{delete_item, DeleteItemInput};
use crate::dynamo::describe_table::describe_table;
use crate::dynamo::execute_statement::{execute_statement, ExecuteStatementInput};
use crate::dynamo::query_table::{query_table, QueryTableInput};
use crate::dynamo::scan_table::{scan_table, ScanTableInput};
use crate::dynamo::types::ApiResponse;
use crate::dynamo::update_item::{update_item, UpdateItemInput};
use crate::dynamo::update_table::{
    create_global_secondary_index, delete_global_secondary_index, update_global_secondary_index,
    CreateGsiInput, DeleteGsiInput, UpdateGsiInput,
};
use crate::dynamo::cloudwatch_metrics::{get_table_metrics, CloudWatchInput};
use crate::dynamo::continuous_backups::describe_continuous_backups;
use crate::dynamo::time_to_live::describe_time_to_live;
use aws_config::meta::region::RegionProviderChain;
use aws_config::Region;
use aws_sdk_dynamodb::{config::Credentials, Client};
use aws_sdk_cloudwatch::Client as CloudWatchClient;
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
        "EXECUTE_STATEMENT" => {
            if let Some(payload) = &options.payload {
                let statement = payload
                    .get("statement")
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let next_token = payload
                    .get("next_token")
                    .and_then(|t| t.as_str());
                let limit = payload
                    .get("limit")
                    .and_then(|l| l.as_i64())
                    .map(|l| l as i32);

                if statement.is_empty() {
                    Ok(ApiResponse {
                        status: 400,
                        message: "PartiQL statement is required".to_string(),
                        data: None,
                    })
                } else {
                    let input = ExecuteStatementInput {
                        statement,
                        next_token,
                        limit,
                    };
                    execute_statement(&client, input).await
                }
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "PartiQL statement payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = UpdateItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                update_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update payload is required".to_string(),
                    data: None,
                })
            }
        }
        "DELETE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = DeleteItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                delete_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Delete payload is required".to_string(),
                    data: None,
                })
            }
        }
        "CREATE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = CreateGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                create_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI creation payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = UpdateGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                update_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI update payload is required".to_string(),
                    data: None,
                })
            }
        }
        "DELETE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = DeleteGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                delete_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI deletion payload is required".to_string(),
                    data: None,
                })
            }
        }
        "GET_TABLE_METRICS" => {
            // Create CloudWatch client with same credentials
            let cloudwatch_client = CloudWatchClient::new(&config);
            
            let period_hours = options.payload
                .as_ref()
                .and_then(|p| p.get("period_hours"))
                .and_then(|v| v.as_i64())
                .unwrap_or(24);
            
            let input = CloudWatchInput {
                table_name: &options.table_name,
                period_hours,
            };
            get_table_metrics(&cloudwatch_client, input).await
        }
        "DESCRIBE_CONTINUOUS_BACKUPS" => {
            describe_continuous_backups(&client, &options.table_name).await
        }
        "DESCRIBE_TIME_TO_LIVE" => {
            describe_time_to_live(&client, &options.table_name).await
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
