use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::error::ProvideErrorMetadata;
use aws_sdk_dynamodb::types::BackupTypeFilter;
use aws_sdk_dynamodb::Client;
use serde_json::json;

pub async fn list_backups(
    client: &Client,
    table_name: Option<String>,
    backup_type: Option<String>,
) -> Result<ApiResponse, String> {
    let backup_type_filter = match backup_type {
        Some(t) if !t.is_empty() => match t.to_uppercase().as_str() {
            "USER" => Some(BackupTypeFilter::User),
            "SYSTEM" => Some(BackupTypeFilter::System),
            "AWS_BACKUP" => Some(BackupTypeFilter::AwsBackup),
            "ALL" => Some(BackupTypeFilter::All),
            other => {
                return Ok(ApiResponse {
                    status: 500,
                    message: format!(
                        "Invalid backup_type '{}': must be USER, SYSTEM, AWS_BACKUP, or ALL",
                        other
                    ),
                    data: None,
                })
            }
        },
        _ => None,
    };

    let mut all_backups: Vec<serde_json::Value> = Vec::new();
    let mut exclusive_start_backup_arn: Option<String> = None;

    loop {
        let mut request = client.list_backups();
        if let Some(tn) = table_name.as_ref() {
            request = request.table_name(tn);
        }
        if let Some(bt) = backup_type_filter.clone() {
            request = request.backup_type(bt);
        }
        if let Some(start) = exclusive_start_backup_arn.as_ref() {
            request = request.exclusive_start_backup_arn(start);
        }

        match request.send().await {
            Ok(response) => {
                for summary in response.backup_summaries() {
                    all_backups.push(json!({
                        "backupArn": summary.backup_arn(),
                        "backupName": summary.backup_name(),
                        "tableName": summary.table_name(),
                        "backupStatus": summary.backup_status().map(|s| s.as_str()),
                        "backupType": summary.backup_type().map(|t| t.as_str()),
                        "backupCreationDateTime": summary
                            .backup_creation_date_time()
                            .map(|d| format!("{}", d)),
                    }));
                }

                match response.last_evaluated_backup_arn() {
                    Some(next) if !next.is_empty() => {
                        exclusive_start_backup_arn = Some(next.to_string());
                    }
                    _ => break,
                }
            }
            Err(e) => {
                // Use Debug format to surface the underlying transport error —
                // `message()` collapses SdkError::DispatchFailure to a generic
                // "dispatch failure" and hides the real connection cause.
                let error_code = e.code().unwrap_or("UnknownError").to_string();
                let error_message = format!("{:?}", e);
                return Ok(ApiResponse {
                    status: 500,
                    message: format!("Failed to list backups: [{}] {}", error_code, error_message),
                    data: None,
                });
            }
        }
    }

    Ok(ApiResponse {
        status: 200,
        message: "Backups listed successfully".to_string(),
        data: Some(json!({ "backups": all_backups })),
    })
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

    fn backup_summary(name: &str, arn_suffix: &str) -> serde_json::Value {
        serde_json::json!({
            "BackupArn": format!("arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/{}", arn_suffix),
            "BackupName": name,
            "TableName": "users",
            "BackupStatus": "AVAILABLE",
            "BackupType": "USER",
            "BackupCreationDateTime": 1700000000.0,
        })
    }

    #[tokio::test]
    async fn test_list_backups_success_with_pagination() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;

        // Has-next page mock mounted FIRST: wiremock gives the first-mounted
        // mock precedence among equal priorities, and up_to_n_times(1) consumes
        // it after one match, so the second request falls through to page 2.
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.ListBackups"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "BackupSummaries": [backup_summary("b1", "0001")],
                "LastEvaluatedBackupArn": "arn:aws:dynamodb:us-east-1:123456789012:table/users/backup/0002",
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.ListBackups"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "BackupSummaries": [backup_summary("b2", "0002")],
            })))
            .up_to_n_times(1)
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_backups(&client, Some("users".to_string()), None)
            .await
            .expect("list_backups should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        let backups = data["backups"]
            .as_array()
            .expect("backups should be an array");
        assert_eq!(backups.len(), 2);
        assert_eq!(backups[0]["backupName"], "b1");
        assert_eq!(backups[1]["backupName"], "b2");
    }

    #[tokio::test]
    async fn test_list_backups_success_empty() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.ListBackups"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_backups(&client, None, None)
            .await
            .expect("list_backups should succeed");

        assert_eq!(response.status, 200);
        let data = response.data.expect("data should be present");
        assert_eq!(
            data["backups"]
                .as_array()
                .expect("backups should be an array")
                .len(),
            0
        );
    }

    #[tokio::test]
    async fn test_list_backups_invalid_backup_type() {
        let server = wiremock::MockServer::start().await;
        let client = make_mock_client(&server).await;

        let response = list_backups(&client, None, Some("INVALID".to_string()))
            .await
            .expect("invalid backup_type returns Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Invalid backup_type"));
        assert!(response
            .message
            .contains("USER, SYSTEM, AWS_BACKUP, or ALL"));
    }

    #[tokio::test]
    async fn test_list_backups_valid_backup_types() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.ListBackups"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({})))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        for backup_type in ["USER", "SYSTEM", "AWS_BACKUP", "ALL"] {
            let response = list_backups(&client, None, Some(backup_type.to_string()))
                .await
                .expect("valid backup_type should succeed");
            assert_eq!(response.status, 200);
        }
    }

    #[tokio::test]
    async fn test_list_backups_error_response() {
        use wiremock::matchers::{header, method, path};
        use wiremock::{Mock, ResponseTemplate};

        let server = wiremock::MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/"))
            .and(header("x-amz-target", "DynamoDB_20120810.ListBackups"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "__type": "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException",
                "message": "not found"
            })))
            .mount(&server)
            .await;

        let client = make_mock_client(&server).await;
        let response = list_backups(&client, None, None)
            .await
            .expect("error response is still Ok(ApiResponse)");

        assert_eq!(response.status, 500);
        assert!(response.message.contains("Failed to list backups"));
        assert!(response.message.contains("ResourceNotFoundException"));
    }
}
