use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{BillingMode, ProvisionedThroughput, TableClass};
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn update_table_config(
    client: &Client,
    table_name: &str,
    billing_mode: Option<&str>,
    read_capacity: Option<i64>,
    write_capacity: Option<i64>,
    table_class: Option<&str>,
) -> Result<ApiResponse, String> {
    let mut request = client.update_table().table_name(table_name);

    if let Some(mode) = billing_mode {
        let billing = match mode.to_uppercase().as_str() {
            "PROVISIONED" => BillingMode::Provisioned,
            _ => BillingMode::PayPerRequest,
        };
        request = request.billing_mode(billing.clone());

        if billing == BillingMode::Provisioned {
            if let (Some(rcu), Some(wcu)) = (read_capacity, write_capacity) {
                let throughput = ProvisionedThroughput::builder()
                    .read_capacity_units(rcu)
                    .write_capacity_units(wcu)
                    .build()
                    .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;
                request = request.provisioned_throughput(throughput);
            }
        }
    } else if let (Some(rcu), Some(wcu)) = (read_capacity, write_capacity) {
        let throughput = ProvisionedThroughput::builder()
            .read_capacity_units(rcu)
            .write_capacity_units(wcu)
            .build()
            .map_err(|e| format!("Failed to build provisioned throughput: {}", e))?;
        request = request.provisioned_throughput(throughput);
    }

    if let Some(class) = table_class {
        let tc = match class.to_uppercase().as_str() {
            "STANDARD_INFREQUENT_ACCESS" => TableClass::StandardInfrequentAccess,
            _ => TableClass::Standard,
        };
        request = request.table_class(tc);
    }

    match request.send().await {
        Ok(response) => {
            let table_name_result = response
                .table_description()
                .and_then(|t| t.table_name())
                .unwrap_or(table_name);
            Ok(ApiResponse {
                status: 200,
                message: format!("Table '{}' configuration updated successfully", table_name_result),
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
                    "Failed to update table config '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}