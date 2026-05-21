use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{
    AttributeDefinition, BillingMode, GlobalSecondaryIndex, KeySchemaElement, KeyType,
    LocalSecondaryIndex, Projection, ProjectionType, ProvisionedThroughput, ScalarAttributeType,
    SseSpecification, SseType, StreamSpecification, StreamViewType, Tag,
};
use aws_sdk_dynamodb::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
pub struct CreateTableInput {
    pub table_name: String,
    pub payload: serde_json::Value,
}

fn parse_scalar_type(type_str: &str) -> ScalarAttributeType {
    match type_str.to_uppercase().as_str() {
        "S" => ScalarAttributeType::S,
        "N" => ScalarAttributeType::N,
        "B" => ScalarAttributeType::B,
        _ => ScalarAttributeType::S,
    }
}

fn parse_stream_view_type(type_str: &str) -> StreamViewType {
    match type_str.to_uppercase().as_str() {
        "KEYS_ONLY" => StreamViewType::KeysOnly,
        "NEW_IMAGE" => StreamViewType::NewImage,
        "OLD_IMAGE" => StreamViewType::OldImage,
        "NEW_AND_OLD_IMAGES" => StreamViewType::NewAndOldImages,
        _ => StreamViewType::NewAndOldImages,
    }
}

fn parse_projection_type(type_str: &str) -> ProjectionType {
    match type_str.to_uppercase().as_str() {
        "ALL" => ProjectionType::All,
        "KEYS_ONLY" => ProjectionType::KeysOnly,
        "INCLUDE" => ProjectionType::Include,
        _ => ProjectionType::All,
    }
}

pub async fn create_table(client: &Client, input: CreateTableInput) -> Result<ApiResponse, String> {
    let payload = &input.payload;

    let table_name = payload
        .get("table_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&input.table_name);

    let partition_key = payload
        .get("partition_key")
        .and_then(|v| v.as_str())
        .ok_or("partition_key is required")?;

    let partition_key_type = payload
        .get("partition_key_type")
        .and_then(|v| v.as_str())
        .unwrap_or("S");

    let billing_mode_str = payload
        .get("billing_mode")
        .and_then(|v| v.as_str())
        .unwrap_or("PAY_PER_REQUEST");

    let billing_mode = match billing_mode_str.to_uppercase().as_str() {
        "PROVISIONED" => BillingMode::Provisioned,
        _ => BillingMode::PayPerRequest,
    };

    let mut key_schema = vec![KeySchemaElement::builder()
        .attribute_name(partition_key)
        .key_type(KeyType::Hash)
        .build()
        .map_err(|e| format!("Failed to build partition key schema: {}", e))?];

    let mut attribute_definitions = vec![AttributeDefinition::builder()
        .attribute_name(partition_key)
        .attribute_type(parse_scalar_type(partition_key_type))
        .build()
        .map_err(|e| format!("Failed to build partition key definition: {}", e))?];

    let sort_key = payload.get("sort_key").and_then(|v| v.as_str());
    if let Some(sk) = sort_key {
        if !sk.is_empty() {
            let sort_key_type = payload
                .get("sort_key_type")
                .and_then(|v| v.as_str())
                .unwrap_or("S");

            key_schema.push(
                KeySchemaElement::builder()
                    .attribute_name(sk)
                    .key_type(KeyType::Range)
                    .build()
                    .map_err(|e| format!("Failed to build sort key schema: {}", e))?,
            );

            attribute_definitions.push(
                AttributeDefinition::builder()
                    .attribute_name(sk)
                    .attribute_type(parse_scalar_type(sort_key_type))
                    .build()
                    .map_err(|e| format!("Failed to build sort key definition: {}", e))?,
            );
        }
    }

    let mut request = client
        .create_table()
        .table_name(table_name)
        .set_key_schema(Some(key_schema))
        .set_attribute_definitions(Some(attribute_definitions.clone()))
        .billing_mode(billing_mode.clone());

    if billing_mode == BillingMode::Provisioned {
        let read_capacity = payload
            .get("read_capacity_units")
            .and_then(|v| v.as_i64())
            .unwrap_or(5);
        let write_capacity = payload
            .get("write_capacity_units")
            .and_then(|v| v.as_i64())
            .unwrap_or(5);

        let throughput = ProvisionedThroughput::builder()
            .read_capacity_units(read_capacity)
            .write_capacity_units(write_capacity)
            .build()
            .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;

        request = request.provisioned_throughput(throughput);
    }

    if let Some(gsis) = payload
        .get("global_secondary_indexes")
        .and_then(|v| v.as_array())
    {
        let mut gsi_list: Vec<GlobalSecondaryIndex> = Vec::new();

        for gsi in gsis {
            if let Some(gsi_obj) = gsi.as_object() {
                let index_name = gsi_obj
                    .get("index_name")
                    .and_then(|v| v.as_str())
                    .ok_or("GSI index_name is required")?;

                let gsi_key_schema_arr = gsi_obj
                    .get("key_schema")
                    .and_then(|v| v.as_array())
                    .ok_or("GSI key_schema is required")?;

                let mut gsi_key_schema: Vec<KeySchemaElement> = Vec::new();
                for key_item in gsi_key_schema_arr {
                    if let Some(key_obj) = key_item.as_object() {
                        let attr_name = key_obj
                            .get("attribute_name")
                            .and_then(|v| v.as_str())
                            .ok_or("GSI key attribute_name is required")?;

                        let key_type_str = key_obj
                            .get("key_type")
                            .and_then(|v| v.as_str())
                            .ok_or("GSI key key_type is required")?;

                        let attr_type_str = key_obj
                            .get("attribute_type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("S");

                        let key_type = match key_type_str.to_uppercase().as_str() {
                            "HASH" => KeyType::Hash,
                            "RANGE" => KeyType::Range,
                            _ => KeyType::Hash,
                        };

                        gsi_key_schema.push(
                            KeySchemaElement::builder()
                                .attribute_name(attr_name)
                                .key_type(key_type)
                                .build()
                                .map_err(|e| format!("Failed to build GSI key schema: {}", e))?,
                        );

                        // Add to attribute definitions if not already present
                        let attr_def_exists = attribute_definitions
                            .iter()
                            .any(|a| a.attribute_name() == attr_name);
                        if !attr_def_exists {
                            attribute_definitions.push(
                                AttributeDefinition::builder()
                                    .attribute_name(attr_name)
                                    .attribute_type(parse_scalar_type(attr_type_str))
                                    .build()
                                    .map_err(|e| {
                                        format!("Failed to build GSI attribute definition: {}", e)
                                    })?,
                            );
                        }
                    }
                }

                let projection_type_str = gsi_obj
                    .get("projection_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("ALL");

                let mut projection_builder = Projection::builder()
                    .projection_type(parse_projection_type(projection_type_str));

                if projection_type_str.to_uppercase() == "INCLUDE" {
                    if let Some(non_key_attrs) =
                        gsi_obj.get("non_key_attributes").and_then(|v| v.as_array())
                    {
                        for attr in non_key_attrs {
                            if let Some(attr_str) = attr.as_str() {
                                projection_builder =
                                    projection_builder.non_key_attributes(attr_str);
                            }
                        }
                    }
                }

                let projection = projection_builder.build();

                let mut gsi_builder = GlobalSecondaryIndex::builder()
                    .index_name(index_name)
                    .set_key_schema(Some(gsi_key_schema))
                    .projection(projection);

                if billing_mode == BillingMode::Provisioned {
                    let gsi_rcu = gsi_obj
                        .get("read_capacity_units")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(5);
                    let gsi_wcu = gsi_obj
                        .get("write_capacity_units")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(5);

                    gsi_builder = gsi_builder.provisioned_throughput(
                        ProvisionedThroughput::builder()
                            .read_capacity_units(gsi_rcu)
                            .write_capacity_units(gsi_wcu)
                            .build()
                            .map_err(|e| format!("Failed to build GSI throughput: {}", e))?,
                    );
                }

                gsi_list.push(
                    gsi_builder
                        .build()
                        .map_err(|e| format!("Failed to build GSI: {}", e))?,
                );
            }
        }

        if !gsi_list.is_empty() {
            request = request.set_global_secondary_indexes(Some(gsi_list));
        }
    }

    if sort_key.is_some() {
        if let Some(lsis) = payload
            .get("local_secondary_indexes")
            .and_then(|v| v.as_array())
        {
            let mut lsi_list: Vec<LocalSecondaryIndex> = Vec::new();

            for lsi in lsis {
                if let Some(lsi_obj) = lsi.as_object() {
                    let index_name = lsi_obj
                        .get("index_name")
                        .and_then(|v| v.as_str())
                        .ok_or("LSI index_name is required")?;

                    let lsi_key_schema_arr = lsi_obj
                        .get("key_schema")
                        .and_then(|v| v.as_array())
                        .ok_or("LSI key_schema is required")?;

                    let mut lsi_key_schema: Vec<KeySchemaElement> = Vec::new();
                    for key_item in lsi_key_schema_arr {
                        if let Some(key_obj) = key_item.as_object() {
                            let attr_name = key_obj
                                .get("attribute_name")
                                .and_then(|v| v.as_str())
                                .ok_or("LSI key attribute_name is required")?;

                            let key_type_str = key_obj
                                .get("key_type")
                                .and_then(|v| v.as_str())
                                .ok_or("LSI key key_type is required")?;

                            let attr_type_str = key_obj
                                .get("attribute_type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("S");

                            let key_type = match key_type_str.to_uppercase().as_str() {
                                "HASH" => KeyType::Hash,
                                "RANGE" => KeyType::Range,
                                _ => KeyType::Hash,
                            };

                            lsi_key_schema.push(
                                KeySchemaElement::builder()
                                    .attribute_name(attr_name)
                                    .key_type(key_type)
                                    .build()
                                    .map_err(|e| {
                                        format!("Failed to build LSI key schema: {}", e)
                                    })?,
                            );

                            let attr_def_exists = attribute_definitions
                                .iter()
                                .any(|a| a.attribute_name() == attr_name);
                            if !attr_def_exists {
                                attribute_definitions.push(
                                    AttributeDefinition::builder()
                                        .attribute_name(attr_name)
                                        .attribute_type(parse_scalar_type(attr_type_str))
                                        .build()
                                        .map_err(|e| {
                                            format!(
                                                "Failed to build LSI attribute definition: {}",
                                                e
                                            )
                                        })?,
                                );
                            }
                        }
                    }

                    let projection_type_str = lsi_obj
                        .get("projection_type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("ALL");

                    let mut projection_builder = Projection::builder()
                        .projection_type(parse_projection_type(projection_type_str));

                    if projection_type_str.to_uppercase() == "INCLUDE" {
                        if let Some(non_key_attrs) =
                            lsi_obj.get("non_key_attributes").and_then(|v| v.as_array())
                        {
                            for attr in non_key_attrs {
                                if let Some(attr_str) = attr.as_str() {
                                    projection_builder =
                                        projection_builder.non_key_attributes(attr_str);
                                }
                            }
                        }
                    }

                    let projection = projection_builder.build();

                    lsi_list.push(
                        LocalSecondaryIndex::builder()
                            .index_name(index_name)
                            .set_key_schema(Some(lsi_key_schema))
                            .projection(projection)
                            .build()
                            .map_err(|e| format!("Failed to build LSI: {}", e))?,
                    );
                }
            }

            if !lsi_list.is_empty() {
                request = request.set_local_secondary_indexes(Some(lsi_list));
            }
        }
    }

    // Update attribute definitions on request
    request = request.set_attribute_definitions(Some(attribute_definitions));

    if let Some(stream_spec) = payload
        .get("stream_specification")
        .and_then(|v| v.as_object())
    {
        let stream_enabled = stream_spec
            .get("stream_enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if stream_enabled {
            let stream_view_type_str = stream_spec
                .get("stream_view_type")
                .and_then(|v| v.as_str())
                .unwrap_or("NEW_AND_OLD_IMAGES");

            let stream_specification = StreamSpecification::builder()
                .stream_enabled(true)
                .stream_view_type(parse_stream_view_type(stream_view_type_str))
                .build()
                .map_err(|e| format!("Failed to build stream specification: {}", e))?;

            request = request.stream_specification(stream_specification);
        }
    }

    if let Some(sse_spec) = payload.get("sse_specification").and_then(|v| v.as_object()) {
        let sse_enabled = sse_spec
            .get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if sse_enabled {
            let sse_type_str = sse_spec
                .get("sse_type")
                .and_then(|v| v.as_str())
                .unwrap_or("AES256");

            let sse_type = match sse_type_str.to_uppercase().as_str() {
                "AES256" => SseType::Aes256,
                "KMS" => SseType::Kms,
                _ => SseType::Aes256,
            };

            let mut sse_builder = SseSpecification::builder().enabled(true).sse_type(sse_type);

            if let Some(kms_key_id) = sse_spec.get("kms_master_key_id").and_then(|v| v.as_str()) {
                sse_builder = sse_builder.kms_master_key_id(kms_key_id);
            }

            let sse_specification = sse_builder.build();

            request = request.sse_specification(sse_specification);
        }
    }

    if let Some(tags) = payload.get("tags").and_then(|v| v.as_array()) {
        let mut tag_list: Vec<Tag> = Vec::new();

        for tag in tags {
            if let Some(tag_obj) = tag.as_object() {
                let key = tag_obj.get("key").and_then(|v| v.as_str());

                let value = tag_obj.get("value").and_then(|v| v.as_str());

                if let (Some(k), Some(v)) = (key, value) {
                    tag_list.push(
                        Tag::builder()
                            .key(k)
                            .value(v)
                            .build()
                            .map_err(|e| format!("Failed to build tag: {}", e))?,
                    );
                }
            }
        }

        if !tag_list.is_empty() {
            request = request.set_tags(Some(tag_list));
        }
    }

    match request.send().await {
        Ok(response) => {
            let table_name_result = response
                .table_description()
                .and_then(|t| t.table_name())
                .unwrap_or(table_name);
            Ok(ApiResponse {
                status: 200,
                message: format!("Table '{}' created successfully", table_name_result),
                data: Some(json!({
                    "tableName": table_name_result,
                })),
            })
        }
        Err(e) => {
            let error_code = e.code().unwrap_or("UnknownError").to_string();
            let error_message = e
                .message()
                .map(|m| m.to_string())
                .unwrap_or_else(|| format!("{:#}", e));
            Ok(ApiResponse {
                status: 500,
                message: format!(
                    "Failed to create table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}
