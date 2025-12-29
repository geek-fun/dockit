use crate::common::json_utils::convert_json_to_attr_value;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose};

pub struct CreateItemInput<'a> {
    pub table_name: &'a str,
    pub payload: &'a Value,
}

pub async fn create_item(
    client: &Client,
    input: CreateItemInput<'_>,
) -> Result<ApiResponse, String> {
    if let Some(attributes) = input.payload.get("attributes").and_then(|v| v.as_array()) {
        let mut put_item = client.put_item().table_name(input.table_name);

        for attr in attributes {
            if let (Some(key), Some(value), Some(attr_type)) = (
                attr.get("key").and_then(|v| v.as_str()),
                attr.get("value"),
                attr.get("type").and_then(|v| v.as_str()),
            ) {
                let attr_value = match attr_type {
                    "S" => value.as_str().map(|s| AttributeValue::S(s.to_string())),
                    "N" => value.as_f64().map(|n| AttributeValue::N(n.to_string())),
                    "B" => value.as_str().map(|s| {
                        AttributeValue::B(aws_sdk_dynamodb::primitives::Blob::new(
                            general_purpose::STANDARD.decode(s).unwrap_or_default(),
                        ))
                    }),
                    "BOOL" => value.as_bool().map(AttributeValue::Bool),
                    "NULL" => Some(AttributeValue::Null(true)),
                    "SS" => value.as_array().map(|arr| {
                        AttributeValue::Ss(
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect(),
                        )
                    }),
                    "NS" => value.as_array().map(|arr| {
                        AttributeValue::Ns(
                            arr.iter()
                                .filter_map(|v| v.as_f64().map(|n| n.to_string()))
                                .collect(),
                        )
                    }),
                    "BS" => value.as_array().map(|arr| {
                        AttributeValue::Bs(
                            arr.iter()
                                .filter_map(|v| {
                                    v.as_str().map(|s| {
                                        aws_sdk_dynamodb::primitives::Blob::new(
                                            general_purpose::STANDARD.decode(s).unwrap_or_default(),
                                        )
                                    })
                                })
                                .collect(),
                        )
                    }),
                    "L" => value.as_array().map(|arr| {
                        AttributeValue::L(
                            arr.iter()
                                .filter_map(|v| {
                                    // Recursively convert each element
                                    convert_json_to_attr_value(v)
                                })
                                .collect(),
                        )
                    }),
                    "M" => value.as_object().map(|map| {
                        AttributeValue::M(
                            map.iter()
                                .filter_map(|(k, v)| {
                                    convert_json_to_attr_value(v).map(|av| (k.clone(), av))
                                })
                                .collect(),
                        )
                    }),
                    _ => None,
                };
                if let Some(av) = attr_value {
                    put_item = put_item.item(key, av);
                }
            }
        }

        match put_item.send().await {
            Ok(_) => Ok(ApiResponse {
                status: 200,
                message: "Item created successfully".to_string(),
                data: None,
            }),
            Err(e) => Ok(ApiResponse {
                status: 500,
                message: format!("Failed to create item: {}", e),
                data: None,
            }),
        }
    } else {
        Ok(ApiResponse {
            status: 400,
            message: "Attributes array is required".to_string(),
            data: None,
        })
    }
}
