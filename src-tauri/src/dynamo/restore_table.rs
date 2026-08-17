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

#[cfg(test)]
mod tests {
    use super::*;

    async fn make_mock_client(server: &wiremock::MockServer) -> aws_sdk_dynamodb::Client {
        let config = serde_json::json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "test",
            "secretAccessKey": "test",
            "endpointUrl": server.uri(),
        });
        crate::common::dynamo::create_dynamo_client(&config, None)
            .await
            .expect("client creation should succeed")
    }

    fn restore_input(payload: serde_json::Value) -> RestoreTableInput {
        RestoreTableInput {
            source_table_name: "src".into(),
            target_table_name: "dst".into(),
            payload,
        }
    }

    fn table_description_body() -> serde_json::Value {
        serde_json::json!({
            "TableDescription": {"TableName": "restored-users", "TableStatus": "CREATING"}
        })
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("from backup"));
        let data = response.data.expect("data should be present");
        assert_eq!(data["tableName"], "restored-users");
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_falls_back_to_target_name() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        assert_eq!(data["tableName"], "dst");
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_error() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("error path returns Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response
            .message
            .contains("Failed to restore table from backup"));
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_gsi_override_as_string() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001",
            "global_secondary_index_override": "[{\"index_name\": \"gsi1\", \"key_schema\": [{\"attribute_name\": \"sk\", \"key_type\": \"RANGE\"}], \"projection_type\": \"INCLUDE\", \"non_key_attributes\": [\"a\"]}]"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("from backup"));
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_gsi_override_as_array() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001",
            "global_secondary_index_override": [
                {"index_name": "gsi1", "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}], "projection_type": "ALL", "read_capacity_units": 5, "write_capacity_units": 5}
            ]
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("from backup"));
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_billing_mode_provisioned() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001",
            "billing_mode_override": "PROVISIONED"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn test_restore_table_from_backup_without_billing_override() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableFromBackup",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "source_backup_arn": "arn:aws:dynamodb:us-east-1:123456789012:table/src/backup/001"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn test_restore_table_to_point_in_time_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableToPointInTime",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "restore_date_time": "2024-01-15T12:30:00Z"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("to point-in-time"));
        let data = response.data.expect("data should be present");
        assert_eq!(data["tableName"], "restored-users");
    }

    #[tokio::test]
    async fn test_restore_table_pitr_invalid_restore_date_time() {
        let client = make_mock_client(&wiremock::MockServer::start().await).await;
        let input = restore_input(serde_json::json!({
            "restore_date_time": "not-a-date"
        }));
        let result = restore_table(&client, input).await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("not a valid ISO-8601 timestamp"));
    }

    #[tokio::test]
    async fn test_restore_table_pitr_use_latest_true() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableToPointInTime",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "use_latest_restorable_time": true
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn test_restore_table_pitr_use_latest_false() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableToPointInTime",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "use_latest_restorable_time": false
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn test_restore_table_pitr_use_latest_string_false() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableToPointInTime",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({
            "use_latest_restorable_time": "false"
        }));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[tokio::test]
    async fn test_restore_table_pitr_use_latest_default() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header(
                "x-amz-target",
                "DynamoDB_20120810.RestoreTableToPointInTime",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(table_description_body()))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let input = restore_input(serde_json::json!({}));
        let response = restore_table(&client, input)
            .await
            .expect("restore should succeed");

        assert_eq!(response.status, 200);
    }

    #[test]
    fn test_parse_gsi_none() {
        let result = parse_global_secondary_indexes(None).expect("None should parse");
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_gsi_valid_array() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(result.len(), 1);
        let gsi = &result[0];
        assert_eq!(gsi.index_name(), "gsi1");
        let key_schema = gsi.key_schema();
        assert_eq!(key_schema.len(), 1);
        assert_eq!(key_schema[0].attribute_name(), "pk");
        assert_eq!(key_schema[0].key_type(), &KeyType::Hash);
        assert_eq!(
            gsi.projection().unwrap().projection_type().unwrap(),
            &ProjectionType::All
        );
    }

    #[test]
    fn test_parse_gsi_json_string_array() {
        let value = serde_json::json!(
            "[{\"index_name\": \"gsi1\", \"key_schema\": [{\"attribute_name\": \"pk\", \"key_type\": \"HASH\"}], \"projection_type\": \"ALL\"}]"
        );
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].index_name(), "gsi1");
    }

    #[test]
    fn test_parse_gsi_invalid_json_string() {
        let value = serde_json::json!("not json");
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("is not valid JSON"));
    }

    #[test]
    fn test_parse_gsi_string_not_array() {
        let value = serde_json::json!("{}");
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON array"));
    }

    #[test]
    fn test_parse_gsi_not_array_not_string() {
        let value = serde_json::json!({"a": 1});
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON array"));
    }

    #[test]
    fn test_parse_gsi_missing_index_name() {
        let value = serde_json::json!([{
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("index_name is required"));
    }

    #[test]
    fn test_parse_gsi_missing_key_schema() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("key_schema is required"));
    }

    #[test]
    fn test_parse_gsi_item_not_object() {
        let value = serde_json::json!(["not-an-object"]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON object"));
    }

    #[test]
    fn test_parse_gsi_key_schema_entry_not_object() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": ["not-an-object"],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be a JSON object"));
    }

    #[test]
    fn test_parse_gsi_key_schema_missing_attribute_name() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"key_type": "HASH"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("attribute_name is required"));
    }

    #[test]
    fn test_parse_gsi_key_schema_missing_key_type() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("key_type is required"));
    }

    #[test]
    fn test_parse_gsi_key_type_range() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "sk", "key_type": "RANGE"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(result[0].key_schema()[0].key_type(), &KeyType::Range);
    }

    #[test]
    fn test_parse_gsi_key_type_unknown_falls_back_to_hash() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "SORTED"}],
            "projection_type": "ALL"
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(result[0].key_schema()[0].key_type(), &KeyType::Hash);
    }

    #[test]
    fn test_parse_gsi_projection_keys_only() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "KEYS_ONLY"
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(
            result[0].projection().unwrap().projection_type().unwrap(),
            &ProjectionType::KeysOnly
        );
    }

    #[test]
    fn test_parse_gsi_projection_unknown_falls_back_to_all() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "BOGUS"
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        assert_eq!(
            result[0].projection().unwrap().projection_type().unwrap(),
            &ProjectionType::All
        );
    }

    #[test]
    fn test_parse_gsi_projection_include_non_key_attributes() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "INCLUDE",
            "non_key_attributes": ["a", "b"]
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        let projection = result[0].projection().unwrap();
        assert_eq!(
            projection.projection_type().unwrap(),
            &ProjectionType::Include
        );
        assert_eq!(
            projection.non_key_attributes(),
            &["a".to_string(), "b".to_string()]
        );
    }

    #[test]
    fn test_parse_gsi_provisioned_throughput() {
        let value = serde_json::json!([{
            "index_name": "gsi1",
            "key_schema": [{"attribute_name": "pk", "key_type": "HASH"}],
            "projection_type": "ALL",
            "read_capacity_units": 5,
            "write_capacity_units": 7
        }]);
        let result = parse_global_secondary_indexes(Some(&value)).expect("should parse");
        let throughput = result[0]
            .provisioned_throughput()
            .expect("should have provisioned throughput");
        assert_eq!(throughput.read_capacity_units(), 5);
        assert_eq!(throughput.write_capacity_units(), 7);
    }
}
