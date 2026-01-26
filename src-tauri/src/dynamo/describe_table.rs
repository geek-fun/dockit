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
                "billingMode": response.table().and_then(|t| t.billing_mode_summary().and_then(|b| b.billing_mode().map(|m| m.as_str().to_string()))),
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
                "streamSpecification": response.table().and_then(|t| t.stream_specification().map(|s| json!({
                    "streamEnabled": s.stream_enabled(),
                    "streamViewType": s.stream_view_type().map(|v| v.as_str().to_string())
                }))),
                "sseDescription": response.table().and_then(|t| t.sse_description().map(|s| json!({
                    "status": s.status().map(|st| st.as_str().to_string()),
                    "sseType": s.sse_type().map(|t| t.as_str().to_string()),
                    "kmsMasterKeyArn": s.kms_master_key_arn()
                }))),
                "tableClassSummary": response.table().and_then(|t| t.table_class_summary().and_then(|c| c.table_class().map(|tc| tc.as_str().to_string()))),
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
                                "itemCount": gsi.item_count(),
                                "sizeBytes": gsi.index_size_bytes(),
                                "keySchema": gsi.key_schema().iter().map(|k| {
                                    json!({
                                        "attributeName": k.attribute_name(),
                                        "keyType": format!("{:?}", k.key_type())
                                    })
                                }).collect::<Vec<_>>(),
                                "projection": gsi.projection().map(|p| {
                                    json!({
                                        "projectionType": p.projection_type().map(|pt| pt.as_str().to_string()),
                                        "nonKeyAttributes": p.non_key_attributes().to_vec()
                                    })
                                }),
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
                                "itemCount": lsi.item_count(),
                                "sizeBytes": lsi.index_size_bytes(),
                                "keySchema": lsi.key_schema().iter().map(|k| {
                                    json!({
                                        "attributeName": k.attribute_name(),
                                        "keyType": format!("{:?}", k.key_type())
                                    })
                                }).collect::<Vec<_>>(),
                                "projection": lsi.projection().map(|p| {
                                    json!({
                                        "projectionType": p.projection_type().map(|pt| pt.as_str().to_string()),
                                        "nonKeyAttributes": p.non_key_attributes().to_vec()
                                    })
                                })
                            });
                            indices.push(index_info);
                        }
                    }

                    indices
                }),
                 "creationDateTime": response.table().and_then(|t|
                        t.creation_date_time().map(|dt| dt.to_string())),
                "provisionedThroughput": response.table().and_then(|t| t.provisioned_throughput().map(|pt| json!({
                    "readCapacityUnits": pt.read_capacity_units(),
                    "writeCapacityUnits": pt.write_capacity_units()
                }))),
                "warmThroughput": response.table().and_then(|t| t.warm_throughput().and_then(|wt| {
                    wt.read_units_per_second().or(wt.write_units_per_second()).map(|_| json!({
                        "readUnitsPerSecond": wt.read_units_per_second(),
                        "writeUnitsPerSecond": wt.write_units_per_second()
                    }))
                })),
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
