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

async fn set_stream(
    client: &Client,
    table_name: &str,
    stream_enabled: bool,
    stream_view_type: Option<&str>,
) -> Result<(), String> {
    let mut spec_builder = StreamSpecification::builder().stream_enabled(stream_enabled);

    if stream_enabled {
        let view_type = stream_view_type.unwrap_or("NEW_AND_OLD_IMAGES");
        spec_builder = spec_builder.stream_view_type(parse_stream_view_type(view_type));
    }

    let spec = spec_builder
        .build()
        .map_err(|e| format!("Failed to build stream specification: {}", e))?;

    client
        .update_table()
        .table_name(table_name)
        .stream_specification(spec)
        .send()
        .await
        .map_err(|e| {
            let code = e.code().unwrap_or("UnknownError");
            let msg = e.message().map(|m| m.to_string()).unwrap_or_else(|| format!("{:#}", e));
            format!("[{}] {}", code, msg)
        })?;

    Ok(())
}

pub async fn update_streams(
    client: &Client,
    table_name: &str,
    stream_enabled: bool,
    stream_view_type: Option<&str>,
) -> Result<ApiResponse, String> {
    let result = set_stream(client, table_name, stream_enabled, stream_view_type).await;

    match result {
        Ok(()) => Ok(ApiResponse {
            status: 200,
            message: format!("Streams updated successfully for table '{}'", table_name),
            data: Some(json!({
                "tableName": table_name,
                "streamEnabled": stream_enabled,
                "streamViewType": stream_view_type,
            })),
        }),
        Err(err) => {
            // DynamoDB (including Local) rejects enabling streams on a table that already has them.
            // To change the view type: disable first, then re-enable with the new type.
            if stream_enabled && err.contains("already has an enabled stream") {
                let disable_result = set_stream(client, table_name, false, None).await;
                if let Err(disable_err) = disable_result {
                    return Ok(ApiResponse {
                        status: 500,
                        message: format!(
                            "Failed to disable streams before re-enabling for table '{}': {}",
                            table_name, disable_err
                        ),
                        data: None,
                    });
                }

                match set_stream(client, table_name, true, stream_view_type).await {
                    Ok(()) => Ok(ApiResponse {
                        status: 200,
                        message: format!(
                            "Streams updated successfully for table '{}'",
                            table_name
                        ),
                        data: Some(json!({
                            "tableName": table_name,
                            "streamEnabled": stream_enabled,
                            "streamViewType": stream_view_type,
                        })),
                    }),
                    Err(enable_err) => Ok(ApiResponse {
                        status: 500,
                        message: format!(
                            "Failed to re-enable streams for table '{}': {}",
                            table_name, enable_err
                        ),
                        data: None,
                    }),
                }
            } else {
                Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Failed to update streams for table '{}': {}",
                        table_name, err
                    ),
                    data: None,
                })
            }
        }
    }
}
