use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn describe_backup(client: &Client, backup_arn: &str) -> Result<ApiResponse, String> {
    match client.describe_backup().backup_arn(backup_arn).send().await {
        Ok(output) => {
            let backup = output.backup_description().map(|desc| {
                let details = desc.backup_details();
                let source = desc.source_table_details();
                json!({
                    "backupArn": details.map(|d| d.backup_arn().to_string()),
                    "backupName": details.map(|d| d.backup_name().to_string()),
                    "backupSizeBytes": details.and_then(|d| d.backup_size_bytes()),
                    "backupStatus": details.map(|d| d.backup_status().as_str()),
                    "backupType": details.map(|d| d.backup_type().as_str()),
                    "backupCreationDateTime": details.map(|d| format!("{}", d.backup_creation_date_time())),
                    "backupExpiryDateTime": details
                        .and_then(|d| d.backup_expiry_date_time())
                        .map(|d| format!("{}", d)),
                    "sourceTableName": source.map(|s| s.table_name().to_string()),
                    "sourceTableId": source.map(|s| s.table_id().to_string()),
                    "sourceTableArn": source.and_then(|s| s.table_arn().map(|a| a.to_string())),
                    "sourceTableSizeBytes": source.and_then(|s| s.table_size_bytes()),
                    "sourceTableBillingMode": source
                        .and_then(|s| s.billing_mode().map(|b| b.as_str())),
                })
            });

            Ok(ApiResponse {
                status: 200,
                message: "Backup described successfully".to_string(),
                data: Some(json!({ "backup": backup })),
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
                    "Failed to describe backup '{}': [{}] {}",
                    backup_arn, error_code, error_message
                ),
                data: None,
            })
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

    #[tokio::test]
    async fn test_describe_backup_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DescribeBackup"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "BackupDescription": {
                    "BackupDetails": {
                        "BackupArn": "arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/0001",
                        "BackupName": "users-backup",
                        "BackupSizeBytes": 1024,
                        "BackupStatus": "AVAILABLE",
                        "BackupType": "USER",
                        "BackupCreationDateTime": 1700000000.0,
                    },
                    "SourceTableDetails": {
                        "TableName": "users",
                        "TableId": "tid-123",
                        "TableArn": "arn:aws:dynamodb:us-east-1:123456789012:table/users",
                        "TableSizeBytes": 2048,
                        "BillingMode": "PAY_PER_REQUEST",
                    },
                }
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = describe_backup(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/0001",
        )
        .await
        .expect("describe_backup should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        assert_eq!(data["backup"]["sourceTableName"], "users");
    }

    #[tokio::test]
    async fn test_describe_backup_error() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.DescribeBackup"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = describe_backup(
            &client,
            "arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/0001",
        )
        .await
        .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to describe backup"));
        assert!(response.data.is_none());
    }
}
