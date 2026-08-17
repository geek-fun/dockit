use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn create_backup(
    client: &Client,
    table_name: &str,
    backup_name: &str,
) -> Result<ApiResponse, String> {
    match client
        .create_backup()
        .table_name(table_name)
        .backup_name(backup_name)
        .send()
        .await
    {
        Ok(output) => {
            let backup_arn = output
                .backup_details()
                .map(|d| d.backup_arn().to_string())
                .unwrap_or_default();
            let backup_status = output
                .backup_details()
                .map(|d| d.backup_status().as_str().to_string())
                .unwrap_or_default();
            let backup_type = output
                .backup_details()
                .map(|d| d.backup_type().as_str().to_string())
                .unwrap_or_default();
            let created_at = output
                .backup_details()
                .map(|d| format!("{}", d.backup_creation_date_time()))
                .unwrap_or_default();

            Ok(ApiResponse {
                status: 200,
                message: format!(
                    "Backup '{}' created for table '{}'",
                    backup_name, table_name
                ),
                data: Some(json!({
                    "backupArn": backup_arn,
                    "backupName": backup_name,
                    "tableName": table_name,
                    "backupStatus": backup_status,
                    "backupType": backup_type,
                    "backupCreationDateTime": created_at,
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
                    "Failed to create backup '{}' for table '{}': [{}] {}",
                    backup_name, table_name, error_code, error_message
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
    async fn test_create_backup_success() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.CreateBackup"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "BackupDetails": {
                    "BackupArn": "arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/0001",
                    "BackupName": "users-backup",
                    "BackupSizeBytes": 1024,
                    "BackupStatus": "CREATING",
                    "BackupType": "USER",
                    "BackupCreationDateTime": 1700000000.0,
                }
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = create_backup(&client, "users", "users-backup")
            .await
            .expect("create_backup should succeed");

        assert_eq!(response.status, 200);
        assert!(response.message.contains("created"));
        let data = response.data.expect("data should be present");
        assert_eq!(data["backupStatus"], "CREATING");
    }

    #[tokio::test]
    async fn test_create_backup_error() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.CreateBackup"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = create_backup(&client, "users", "users-backup")
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to create backup"));
        assert!(response.data.is_none());
    }
}
