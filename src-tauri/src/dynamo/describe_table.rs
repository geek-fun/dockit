use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_table(client: &Client, table_name: &str) -> Result<ApiResponse, String> {
    match client
        .describe_table()
        .table_name(table_name)
        .send()
        .await
    {
        Ok(response) => {
            // Create a custom serializable structure with the data we need
            let table_info = json!({
                "id": response.table().and_then(|t| t.table_id()),
                "name": response.table().map(|t| t.table_name()),
                "status": response.table().and_then(|t| t.table_status().map(|s| s.as_str().to_string())),
                "itemCount": response.table().and_then(|t| t.item_count()),
                "sizeBytes": response.table().and_then(|t| t.table_size_bytes()),
                "keySchema": response.table().and_then(|t| {
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
        }
        Err(e) => Ok(ApiResponse {
            status: 500,
            message: format!("Failed to describe table: {}", e),
            data: None,
        }),
    }
}
