use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::primitives::{DateTime, DateTimeFormat};
use aws_sdk_dynamodb::types::{
    BillingMode, GlobalSecondaryIndex, KeySchemaElement, KeyType, Projection, ProjectionType,
    ProvisionedThroughput,
};
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub struct RestoreTableInput {
    pub source_table_name: String,
    pub target_table_name: String,
    pub payload: serde_json::Value,
}

fn success_response(
    target_table_name: &str,
    verb: &str,
    restored_table_name: Option<&str>,
) -> ApiResponse {
    let restored_name = restored_table_name.unwrap_or(target_table_name);
    ApiResponse {
        status: 200,
        message: format!("Table '{}' restored {} successfully", restored_name, verb),
        data: Some(json!({ "tableName": restored_name })),
    }
}

fn error_response(
    context: &str,
    e: &(impl ProvideErrorMetadata + std::fmt::Display),
) -> ApiResponse {
    let error_code = e.code().unwrap_or("UnknownError").to_string();
    let error_message = e
        .message()
        .map(|m| m.to_string())
        .unwrap_or_else(|| format!("{:#}", e));
    ApiResponse {
        status: 500,
        message: format!("{}: [{}] {}", context, error_code, error_message),
        data: None,
    }
}

/// Parses the optional `global_secondary_index_override` arg into SDK
/// `GlobalSecondaryIndex` values. Accepts a JSON array directly or a JSON
/// string containing a JSON array (the schema helper emits string-typed props).
fn parse_global_secondary_indexes(
    value: Option<&serde_json::Value>,
) -> Result<Vec<GlobalSecondaryIndex>, String> {
    let items: Vec<serde_json::Value> = match value {
        None => return Ok(Vec::new()),
        Some(serde_json::Value::Array(items)) => items.clone(),
        Some(serde_json::Value::String(s)) => {
            let parsed: serde_json::Value = serde_json::from_str(s)
                .map_err(|e| format!("global_secondary_index_override is not valid JSON: {}", e))?;
            parsed
                .as_array()
                .ok_or("global_secondary_index_override must be a JSON array")?
                .clone()
        }
        Some(_) => return Err("global_secondary_index_override must be a JSON array".to_string()),
    };

    let mut gsi_list: Vec<GlobalSecondaryIndex> = Vec::new();
    for item in &items {
        let gsi = item
            .as_object()
            .ok_or("each GSI override must be a JSON object")?;

        let index_name = gsi
            .get("index_name")
            .and_then(|v| v.as_str())
            .ok_or("GSI override index_name is required")?;

        let key_schema_arr = gsi
            .get("key_schema")
            .and_then(|v| v.as_array())
            .ok_or("GSI override key_schema is required")?;

        let mut key_schema: Vec<KeySchemaElement> = Vec::new();
        for key_item in key_schema_arr {
            let key_obj = key_item
                .as_object()
                .ok_or("each GSI key_schema entry must be a JSON object")?;
            let attribute_name = key_obj
                .get("attribute_name")
                .and_then(|v| v.as_str())
                .ok_or("GSI key_schema attribute_name is required")?;
            let key_type_str = key_obj
                .get("key_type")
                .and_then(|v| v.as_str())
                .ok_or("GSI key_schema key_type is required")?;
            let key_type = match key_type_str.to_uppercase().as_str() {
                "RANGE" => KeyType::Range,
                _ => KeyType::Hash,
            };
            key_schema.push(
                KeySchemaElement::builder()
                    .attribute_name(attribute_name)
                    .key_type(key_type)
                    .build()
                    .map_err(|e| format!("Failed to build GSI key schema: {}", e))?,
            );
        }

        let projection_type_str = gsi
            .get("projection_type")
            .and_then(|v| v.as_str())
            .unwrap_or("ALL");
        let mut projection_builder = Projection::builder().projection_type(
            match projection_type_str.to_uppercase().as_str() {
                "ALL" => ProjectionType::All,
                "KEYS_ONLY" => ProjectionType::KeysOnly,
                "INCLUDE" => ProjectionType::Include,
                _ => ProjectionType::All,
            },
        );
        if projection_type_str.to_uppercase() == "INCLUDE" {
            if let Some(non_key_attrs) = gsi.get("non_key_attributes").and_then(|v| v.as_array()) {
                for attr in non_key_attrs {
                    if let Some(attr_str) = attr.as_str() {
                        projection_builder = projection_builder.non_key_attributes(attr_str);
                    }
                }
            }
        }

        let mut gsi_builder = GlobalSecondaryIndex::builder()
            .index_name(index_name)
            .set_key_schema(Some(key_schema))
            .projection(projection_builder.build());

        if let (Some(rcu), Some(wcu)) = (
            gsi.get("read_capacity_units").and_then(|v| v.as_i64()),
            gsi.get("write_capacity_units").and_then(|v| v.as_i64()),
        ) {
            gsi_builder = gsi_builder.provisioned_throughput(
                ProvisionedThroughput::builder()
                    .read_capacity_units(rcu)
                    .write_capacity_units(wcu)
                    .build()
                    .map_err(|e| format!("Failed to build GSI throughput: {}", e))?,
            );
        }

        gsi_list.push(
            gsi_builder
                .build()
                .map_err(|e| format!("Failed to build GSI override: {}", e))?,
        );
    }
    Ok(gsi_list)
}

pub async fn restore_table(
    client: &Client,
    input: RestoreTableInput,
) -> Result<ApiResponse, String> {
    let source_backup_arn = input
        .payload
        .get("source_backup_arn")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let billing_mode_override = input
        .payload
        .get("billing_mode_override")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| match s.to_uppercase().as_str() {
            "PROVISIONED" => BillingMode::Provisioned,
            _ => BillingMode::PayPerRequest,
        });

    let gsi_override =
        parse_global_secondary_indexes(input.payload.get("global_secondary_index_override"))?;

    if let Some(arn) = source_backup_arn {
        let mut request = client
            .restore_table_from_backup()
            .backup_arn(arn)
            .target_table_name(&input.target_table_name);

        if let Some(billing) = billing_mode_override {
            request = request.billing_mode_override(billing);
        }
        if !gsi_override.is_empty() {
            request = request.set_global_secondary_index_override(Some(gsi_override));
        }

        match request.send().await {
            Ok(output) => Ok(success_response(
                &input.target_table_name,
                "from backup",
                output.table_description().and_then(|t| t.table_name()),
            )),
            Err(e) => Ok(error_response("Failed to restore table from backup", &e)),
        }
    } else {
        let mut request = client
            .restore_table_to_point_in_time()
            .source_table_name(&input.source_table_name)
            .target_table_name(&input.target_table_name);

        let restore_date_time = input
            .payload
            .get("restore_date_time")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty());

        if let Some(dt) = restore_date_time {
            let parsed =
                DateTime::from_str(dt, DateTimeFormat::DateTimeWithOffset).map_err(|e| {
                    format!(
                        "restore_date_time '{}' is not a valid ISO-8601 timestamp: {}",
                        dt, e
                    )
                })?;
            request = request.restore_date_time(parsed);
        } else {
            let use_latest = input
                .payload
                .get("use_latest_restorable_time")
                .and_then(|v| {
                    v.as_bool()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<bool>().ok()))
                })
                .unwrap_or(true);
            request = request.use_latest_restorable_time(use_latest);
        }

        if let Some(billing) = billing_mode_override {
            request = request.billing_mode_override(billing);
        }
        if !gsi_override.is_empty() {
            request = request.set_global_secondary_index_override(Some(gsi_override));
        }

        match request.send().await {
            Ok(output) => Ok(success_response(
                &input.target_table_name,
                "to point-in-time",
                output.table_description().and_then(|t| t.table_name()),
            )),
            Err(e) => Ok(error_response(
                "Failed to restore table to point-in-time",
                &e,
            )),
        }
    }
}
