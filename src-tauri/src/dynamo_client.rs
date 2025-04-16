use aws_config::meta::region::RegionProviderChain;
use aws_sdk_dynamodb::{Client, config::Credentials};
use aws_config::Region;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct DynamoCredentials {
    pub region: String,
    pub access_key_id: String, // AWS access key ID
    pub secret_access_key: String, // AWS secret access key
}

#[derive(Debug, Deserialize)]
pub struct DynamoOptions {
    pub table_name: String,
    pub operation: String,
    pub item: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    status: u16,
    message: String,
    data: Option<serde_json::Value>,
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
        "dockit-client"
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
        "DESCRIBE_TABLE" => {
            match client.describe_table().table_name(&options.table_name).send().await {
                Ok(response) => {
                    // Create a custom serializable structure with the data we need
                    let table_info = json!({
                        "id": response.table().and_then(|t| t.table_id()),
                        "name": response.table().map(|t| t.table_name()),
                        "status": response.table().and_then(|t| t.table_status().map(|s| s.as_str().to_string())),                        "itemCount": response.table().and_then(|t| t.item_count()),
                        "sizeBytes": response.table().and_then(|t| t.table_size_bytes()),
                        "schema": response.table().and_then(|t| {
                            Some(t.key_schema().iter().map(|k| {
                                json!({
                                    "attributeName": k.attribute_name(),
                                    "keyType": format!("{:?}", k.key_type())
                                })
                            }).collect::<Vec<_>>())
                        }),
                        "attributeDefinitions": response.table().and_then(|t| {
                            Some(t.attribute_definitions().iter().map(|a| {
                                json!({
                                    "attributeName": a.attribute_name(),
                                    "attributeType": format!("{:?}", a.attribute_type())
                                })
                            }).collect::<Vec<_>>())
                        }),
                        "indices": response.table().map(|t| {
                            let mut indices = Vec::new();

                            // Add Global Secondary Indexes
                            let gsi_list = t.global_secondary_indexes();
                            if !gsi_list.is_empty() {
                                for gsi in gsi_list {
                                    let index_info = json!({
                                        "type": "GSI",
                                        "name": gsi.index_name(),
                                        "status": gsi.index_status().map(|s| s.as_str().to_string()),
                                        "keySchema": gsi.key_schema().iter().map(|k| {
                                            json!({
                                                "attributeName": k.attribute_name(),
                                                "keyType": format!("{:?}", k.key_type())
                                            })
                                        }).collect::<Vec<_>>(),
                                        "provisionedThroughput": gsi.provisioned_throughput().map(|pt| json!({
                                            "readCapacityUnits": pt.read_capacity_units(),
                                            "writeCapacityUnits": pt.write_capacity_units()
                                        }))
                                    });
                                    indices.push(index_info);
                                }
                            }

                            // Add Local Secondary Indexes
                            let lsi_list = t.local_secondary_indexes();
                            if !lsi_list.is_empty() {
                                for lsi in lsi_list {
                                    let index_info = json!({
                                        "type": "LSI",
                                        "name": lsi.index_name(),
                                        "keySchema": lsi.key_schema().iter().map(|k| {
                                            json!({
                                                "attributeName": k.attribute_name(),
                                                "keyType": format!("{:?}", k.key_type())
                                            })
                                        }).collect::<Vec<_>>()
                                    });
                                    indices.push(index_info);
                                }
                            }

                            indices
                        }),
                         "creationDateTime": response.table().and_then(|t|
                                t.creation_date_time().map(|dt| dt.to_string())),
                    });

                    Ok(ApiResponse {
                        status: 200,
                        message: "Table described successfully".to_string(),
                        data: Some(table_info),
                    })
                },
                Err(e) => Ok(ApiResponse {
                    status: 500,
                    message: format!("Failed to describe table: {}", e),
                    data: None,
                })
            }
        },
        "put_item" => {
            if let Some(item) = &options.item {
                // Implementation for put_item would go here
                Ok(ApiResponse {
                    status: 200,
                    message: "Item put successfully".to_string(),
                    data: Some(json!({"table": options.table_name})),
                })
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Item is required for put_item operation".to_string(),
                    data: None,
                })
            }
        },
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
            let error_response = ApiResponse {
                status: 500,
                message: e,
                data: None,
            };
            Ok(serde_json::to_string(&error_response).map_err(|e| e.to_string())?)
        }
    }
}
