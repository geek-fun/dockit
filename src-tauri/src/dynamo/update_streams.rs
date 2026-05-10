use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::{StreamSpecification, StreamViewType};
use aws_sdk_dynamodb::Client;
use serde_json::json;

fn parse_stream_view_type(type_str: &str) -> StreamViewType {
    match type_str.to_uppercase().as_str() {
        "KEYS_ONLY" => StreamViewType::KeysOnly,
        "NEW_IMAGE" => StreamViewType::NewImage,
        "OLD_IMAGE" => StreamViewType::OldImage,
        "NEW_AND_OLD_IMAGES" => StreamViewType::NewAndOldImages,
        _ => StreamViewType::NewAndOldImages,
    }
}

pub async fn update_streams(
    client: &Client,
    table_name: &str,
    stream_enabled: bool,
    stream_view_type: Option<&str>,
) -> Result<ApiResponse, String> {
    let mut spec_builder = StreamSpecification::builder().stream_enabled(stream_enabled);

    if stream_enabled {
        if let Some(view_type) = stream_view_type {
            spec_builder = spec_builder.stream_view_type(parse_stream_view_type(view_type));
        } else {
            spec_builder = spec_builder.stream_view_type(StreamViewType::NewAndOldImages);
        }
    }

    let spec = spec_builder
        .build()
        .map_err(|e| format!("Failed to build stream specification: {}", e))?;

    match client
        .update_table()
        .table_name(table_name)
        .stream_specification(spec)
        .send()
        .await
    {
        Ok(response) => {
            let spec = response.table_description().and_then(|t| t.stream_specification());
            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "Streams updated successfully for table '{}'",
                    table_name
                ),
                data: Some(json!({
                    "tableName": table_name,
                    "streamEnabled": spec.map(|s| s.stream_enabled()).unwrap_or(false),
                    "streamViewType": spec.and_then(|s| s.stream_view_type().map(|v| v.as_str())),
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
                    "Failed to update streams for table '{}': [{}] {}",
                    table_name, error_code, error_message
                ),
                data: None,
            })
        }
    }
}