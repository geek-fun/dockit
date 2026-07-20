use crate::common::ssh_bridge::resolve_ssh_tunnel;
use crate::dynamo::batch_write_item::{batch_write_item, BatchWriteInput};
use crate::dynamo::types::ApiResponse;
use crate::dynamo::cloudwatch_metrics::{get_table_metrics, CloudWatchInput};
use crate::dynamo::continuous_backups::describe_continuous_backups;
use crate::dynamo::create_item::{create_item, CreateItemInput};
use crate::dynamo::create_table::{create_table, CreateTableInput};
use crate::dynamo::delete_item::{delete_item, DeleteItemInput};
use crate::dynamo::delete_table::delete_table;
use crate::dynamo::describe_table::describe_table;
use crate::dynamo::execute_statement::{execute_statement, ExecuteStatementInput};
use crate::dynamo::list_tables::list_tables;
use crate::dynamo::query_table::{query_table, QueryTableInput};
use crate::dynamo::scan_table::{scan_table, ScanTableInput};
use crate::dynamo::time_to_live::describe_time_to_live;
use crate::dynamo::truncate_table::truncate_table;
use crate::dynamo::update_item::{update_item, UpdateItemInput};
use crate::dynamo::update_pitr::update_continuous_backups;
use crate::dynamo::update_streams::update_streams;
use crate::dynamo::update_table::{
    create_global_secondary_index, delete_global_secondary_index, update_global_secondary_index,
    CreateGsiInput, DeleteGsiInput, UpdateGsiInput,
};
use crate::dynamo::update_table_config::update_table_config;
use crate::dynamo::update_ttl::update_time_to_live;
use aws_config::meta::region::RegionProviderChain;
use aws_config::profile::ProfileFileCredentialsProvider;
use aws_config::Region;
use tauri::Manager;
use aws_sdk_cloudwatch::Client as CloudWatchClient;
use aws_sdk_dynamodb::config::Credentials;
use aws_sdk_dynamodb::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum DynamoAuth {
    #[serde(rename = "accessKey")]
    AccessKey {
        access_key_id: String,
        secret_access_key: String,
    },
    #[serde(rename = "profile")]
    Profile { profile_name: String },
    #[serde(rename = "sso")]
    Sso {
        access_key_id: String,
        secret_access_key: String,
        session_token: Option<String>,
        region: String,
    },
    #[serde(rename = "assumeRole")]
    AssumeRole {
        access_key_id: String,
        secret_access_key: String,
        session_token: Option<String>,
        region: String,
    },
}

#[derive(Debug, Deserialize)]
pub struct DynamoCredentials {
    pub region: String,
    pub endpoint_url: Option<String>,
    pub auth: DynamoAuth,
}

#[derive(Debug, Deserialize)]
pub struct DynamoOptions {
    #[serde(default)]
    pub table_name: String,
    pub operation: String,
    pub payload: Option<serde_json::Value>,
    /// Optional connection ID for SSH tunnel resolution.
    #[serde(default)]
    pub connection_id: Option<String>,
}

fn build_config_builder(
    credentials: &DynamoCredentials,
    tunnel_port: Option<u16>,
) -> aws_config::ConfigLoader {
    let effective_region = if credentials.region.is_empty() {
        match &credentials.auth {
            DynamoAuth::Sso { region, .. } | DynamoAuth::AssumeRole { region, .. } => {
                region.clone()
            }
            _ => credentials.region.clone(),
        }
    } else {
        credentials.region.clone()
    };

    let region_provider = RegionProviderChain::first_try(Region::new(effective_region))
        .or_default_provider()
        .or_else("us-east-1");

    let mut config_builder =
        aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);

    match &credentials.auth {
        DynamoAuth::AccessKey {
            access_key_id,
            secret_access_key,
        } => {
            let creds = Credentials::new(
                access_key_id,
                secret_access_key,
                None,
                None,
                "dockit-client",
            );
            config_builder = config_builder.credentials_provider(creds);
        }
        DynamoAuth::Profile { profile_name } => {
            let profile_provider = ProfileFileCredentialsProvider::builder()
                .profile_name(profile_name)
                .build();
            config_builder = config_builder.credentials_provider(profile_provider);
        }
        DynamoAuth::Sso {
            access_key_id,
            secret_access_key,
            session_token,
            ..
        }
        | DynamoAuth::AssumeRole {
            access_key_id,
            secret_access_key,
            session_token,
            ..
        } => {
            let creds = Credentials::new(
                access_key_id,
                secret_access_key,
                session_token.clone(),
                None,
                "dockit-client",
            );
            config_builder = config_builder.credentials_provider(creds);
        }
    }

    // Apply tunnel endpoint override before the configured endpoint_url
    if let Some(local_port) = tunnel_port {
        config_builder = config_builder.endpoint_url(format!("http://127.0.0.1:{}", local_port));
    } else if let Some(ref endpoint) = credentials.endpoint_url {
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }
    }

    config_builder
}

#[tauri::command]
pub async fn dynamo_api(
    app: tauri::AppHandle,
    credentials: DynamoCredentials,
    options: DynamoOptions,
) -> Result<String, String> {
    // Resolve SSH tunnel port if connection_id is provided
    let tunnel_port = if let Some(ref cid) = options.connection_id {
        app.state::<crate::ssh::TunnelManager>().local_port(cid).await
    } else {
        None
    };
    let config = build_config_builder(&credentials, tunnel_port).load().await;

    let client = Client::new(&config);

    let result = match options.operation.as_str() {
        "LIST_TABLES" => list_tables(&client).await,
        "DESCRIBE_TABLE" => describe_table(&client, &options.table_name).await,
        "CREATE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = CreateItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                create_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Item payload is required".to_string(),
                    data: None,
                })
            }
        }
        "BATCH_WRITE_ITEM" => {
            if let Some(payload) = &options.payload {
                let items = payload
                    .get("items")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let input = BatchWriteInput {
                    table_name: &options.table_name,
                    items: &items,
                };
                batch_write_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Batch write payload is required".to_string(),
                    data: None,
                })
            }
        }
        "QUERY_TABLE" => {
            if let Some(payload) = &options.payload {
                let input = QueryTableInput {
                    table_name: &options.table_name,
                    payload,
                };
                query_table(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Query parameters are required".to_string(),
                    data: None,
                })
            }
        }
        "SCAN_TABLE" => {
            if let Some(payload) = &options.payload {
                let input = ScanTableInput {
                    table_name: &options.table_name,
                    payload,
                };
                scan_table(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Scan parameters are required".to_string(),
                    data: None,
                })
            }
        }
        "EXECUTE_STATEMENT" => {
            if let Some(payload) = &options.payload {
                let statement = payload
                    .get("statement")
                    .and_then(|s| s.as_str())
                    .unwrap_or("");
                let next_token = payload.get("next_token").and_then(|t| t.as_str());
                let limit = payload
                    .get("limit")
                    .and_then(|l| l.as_i64())
                    .map(|l| l as i32);

                if statement.is_empty() {
                    Ok(ApiResponse {
                        status: 400,
                        message: "PartiQL statement is required".to_string(),
                        data: None,
                    })
                } else {
                    let input = ExecuteStatementInput {
                        statement,
                        next_token,
                        limit,
                    };
                    execute_statement(&client, input).await
                }
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "PartiQL statement payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = UpdateItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                update_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update payload is required".to_string(),
                    data: None,
                })
            }
        }
        "DELETE_ITEM" => {
            if let Some(payload) = &options.payload {
                let input = DeleteItemInput {
                    table_name: &options.table_name,
                    payload,
                };
                delete_item(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Delete payload is required".to_string(),
                    data: None,
                })
            }
        }
        "CREATE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = CreateGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                create_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI creation payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = UpdateGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                update_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI update payload is required".to_string(),
                    data: None,
                })
            }
        }
        "DELETE_GLOBAL_SECONDARY_INDEX" => {
            if let Some(payload) = &options.payload {
                let input = DeleteGsiInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                delete_global_secondary_index(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "GSI deletion payload is required".to_string(),
                    data: None,
                })
            }
        }
        "GET_TABLE_METRICS" => {
            let cloudwatch_client = CloudWatchClient::new(&config);

            let period_hours = options
                .payload
                .as_ref()
                .and_then(|p| p.get("period_hours"))
                .and_then(|v| v.as_i64())
                .unwrap_or(24);

            let input = CloudWatchInput {
                table_name: &options.table_name,
                period_hours,
            };
            get_table_metrics(&cloudwatch_client, input).await
        }
        "DESCRIBE_CONTINUOUS_BACKUPS" => {
            describe_continuous_backups(&client, &options.table_name).await
        }
        "DESCRIBE_TIME_TO_LIVE" => describe_time_to_live(&client, &options.table_name).await,
        "CREATE_TABLE" => {
            if let Some(payload) = &options.payload {
                let input = CreateTableInput {
                    table_name: options.table_name.clone(),
                    payload: payload.clone(),
                };
                create_table(&client, input).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Create table payload is required".to_string(),
                    data: None,
                })
            }
        }
        "DELETE_TABLE" => delete_table(&client, &options.table_name).await,
        "TRUNCATE_TABLE" => truncate_table(&client, &options.table_name).await,
        "UPDATE_TABLE_CONFIG" => {
            if let Some(payload) = &options.payload {
                let billing_mode = payload.get("billing_mode").and_then(|v| v.as_str());
                let read_capacity = payload.get("read_capacity_units").and_then(|v| v.as_i64());
                let write_capacity = payload.get("write_capacity_units").and_then(|v| v.as_i64());
                let table_class = payload.get("table_class").and_then(|v| v.as_str());
                update_table_config(
                    &client,
                    &options.table_name,
                    billing_mode,
                    read_capacity,
                    write_capacity,
                    table_class,
                )
                .await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update table config payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_TTL" => {
            if let Some(payload) = &options.payload {
                let enabled = payload
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let attribute_name = payload.get("attribute_name").and_then(|v| v.as_str());
                update_time_to_live(&client, &options.table_name, enabled, attribute_name).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update TTL payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_PITR" => {
            if let Some(payload) = &options.payload {
                let enabled = payload
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                update_continuous_backups(&client, &options.table_name, enabled).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update PITR payload is required".to_string(),
                    data: None,
                })
            }
        }
        "UPDATE_STREAMS" => {
            if let Some(payload) = &options.payload {
                let enabled = payload
                    .get("enabled")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let stream_view_type = payload.get("stream_view_type").and_then(|v| v.as_str());
                update_streams(&client, &options.table_name, enabled, stream_view_type).await
            } else {
                Ok(ApiResponse {
                    status: 400,
                    message: "Update streams payload is required".to_string(),
                    data: None,
                })
            }
        }
        _ => Ok(ApiResponse {
            status: 400,
            message: format!("Unsupported operation: {}", options.operation),
            data: None,
        }),
    };

    match result {
        Ok(response) => Ok(serde_json::to_string(&response).map_err(|e| e.to_string())?),
        Err(e) => {
            println!("Error: {}", e);
            let error_response = ApiResponse {
                status: 500,
                message: e,
                data: None,
            };
            Ok(serde_json::to_string(&error_response).map_err(|e| e.to_string())?)
        }
    }
}

// ── DynamoDB Test Connection ───────────────────────────────────────────

#[tauri::command]
pub async fn dynamo_test_connection(
    app: tauri::AppHandle,
    config: serde_json::Value,
    ssh: Option<serde_json::Value>,
) -> Result<crate::common::response::ApiResponse<serde_json::Value>, String> {
    use crate::common::dynamo::create_dynamo_client;
    use crate::common::response::ApiResponse;

    // Normalize the frontend connection config into the flat format
    // that create_dynamo_client expects (authKind, accessKeyId, etc.)
    let mut normalized = serde_json::Map::new();

    if let Some(v) = config.get("region").and_then(|v| v.as_str()) {
        normalized.insert("region".to_string(), serde_json::json!(v));
    }
    if let Some(v) = config.get("endpointUrl").and_then(|v| v.as_str()) {
        if !v.is_empty() {
            normalized.insert("endpointUrl".to_string(), serde_json::json!(v));
        }
    }
    if let Some(auth) = config.get("auth").and_then(|v| v.as_object()) {
        if let Some(kind) = auth.get("kind").and_then(|v| v.as_str()) {
            normalized.insert("authKind".to_string(), serde_json::json!(kind));
            match kind {
                "accessKey" | "sso" | "assumeRole" => {
                    if let Some(v) = auth.get("accessKeyId").and_then(|v| v.as_str()) {
                        normalized.insert("accessKeyId".to_string(), serde_json::json!(v));
                    }
                    if let Some(v) = auth.get("secretAccessKey").and_then(|v| v.as_str()) {
                        normalized.insert("secretAccessKey".to_string(), serde_json::json!(v));
                    }
                    if let Some(v) = auth.get("sessionToken").and_then(|v| v.as_str()) {
                        if !v.is_empty() {
                            normalized.insert("sessionToken".to_string(), serde_json::json!(v));
                        }
                    }
                }
                "profile" => {
                    if let Some(v) = auth.get("profileName").and_then(|v| v.as_str()) {
                        normalized.insert("profileName".to_string(), serde_json::json!(v));
                    }
                }
                _ => {}
            }
        }
    }

    // Extract remote target from endpointUrl for SSH tunnel
    let remote_host = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|p| p.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| "localhost".to_string());

    let remote_port = config
        .get("endpointUrl")
        .and_then(|v| v.as_str())
        .and_then(|u| url::Url::parse(u).ok())
        .and_then(|p| p.port())
        .unwrap_or(443u16);

    let tunnel = resolve_ssh_tunnel(&app, ssh.as_ref(), &remote_host, remote_port).await?;
    normalized.insert("endpointUrl".to_string(), serde_json::json!(format!("http://{}:{}", tunnel.host, tunnel.port)));

    let client = create_dynamo_client(&serde_json::Value::Object(normalized), None).await?;
    let response = list_tables(&client).await?;

    let table_names = response.data
        .and_then(|d| d.get("tableNames").and_then(|v| v.as_array()).cloned())
        .unwrap_or_default();

    Ok(ApiResponse::ok(serde_json::json!({ "tableNames": table_names })))
}

// ── STS AssumeRole ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialsResponse {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: String,
    pub expiration_timestamp: u64,
}

#[tauri::command]
pub async fn aws_assume_role(
    source_profile_name: String,
    role_arn: String,
    external_id: Option<String>,
    mfa_serial: Option<String>,
    mfa_token: Option<String>,
) -> Result<CredentialsResponse, String> {
    let profile_provider = ProfileFileCredentialsProvider::builder()
        .profile_name(&source_profile_name)
        .build();

    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new("us-east-1"))
        .credentials_provider(profile_provider)
        .load()
        .await;

    let sts_client = aws_sdk_sts::Client::new(&config);

    let mut req = sts_client
        .assume_role()
        .role_arn(&role_arn)
        .role_session_name("dockit-session");

    if let Some(id) = &external_id {
        req = req.external_id(id);
    }
    if let Some(serial) = &mfa_serial {
        req = req.serial_number(serial);
    }
    if let Some(token) = &mfa_token {
        req = req.token_code(token);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("STS AssumeRole failed: {}", e))?;

    let creds = resp
        .credentials
        .ok_or_else(|| "No credentials returned from STS".to_string())?;

    let access_key_id = creds.access_key_id().to_string();
    let secret_access_key = creds.secret_access_key().to_string();
    let session_token = creds.session_token().to_string();
    let expiration_timestamp = creds.expiration().secs() as u64;

    Ok(CredentialsResponse {
        access_key_id,
        secret_access_key,
        session_token,
        expiration_timestamp,
    })
}

// ── SSO Device Authorization ──────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoDeviceAuthResponse {
    pub verification_uri: String,
    pub user_code: String,
    pub device_code: String,
    pub client_id: String,
    pub client_secret: String,
    pub interval: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoTokenPollResponse {
    pub access_token: Option<String>,
    pub expires_at: Option<u64>,
    pub status: String,
    pub error_message: Option<String>,
}

#[tauri::command]
pub async fn aws_sso_start_device_auth(
    start_url: String,
    sso_region: String,
) -> Result<SsoDeviceAuthResponse, String> {
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new(sso_region))
        .load()
        .await;

    let oidc_client = aws_sdk_ssooidc::Client::new(&config);

    // Register client (in-memory caching would be ideal, but registering each time works)
    let reg_resp = oidc_client
        .register_client()
        .client_name("dockit")
        .client_type("public")
        .send()
        .await
        .map_err(|e| format!("SSO register client failed: {}", e))?;

    let client_id = reg_resp
        .client_id()
        .ok_or_else(|| "No client ID returned from SSO registration".to_string())?
        .to_string();
    let client_secret = reg_resp.client_secret().unwrap_or_default().to_string();

    let auth_resp = oidc_client
        .start_device_authorization()
        .client_id(&client_id)
        .client_secret(&client_secret)
        .start_url(&start_url)
        .send()
        .await
        .map_err(|e| format!("SSO start device auth failed: {}", e))?;

    let interval = {
        let val = auth_resp.interval();
        if val > 0 {
            val
        } else {
            5
        }
    };

    Ok(SsoDeviceAuthResponse {
        verification_uri: auth_resp
            .verification_uri_complete()
            .or_else(|| auth_resp.verification_uri())
            .unwrap_or_default()
            .to_string(),
        user_code: auth_resp.user_code().unwrap_or_default().to_string(),
        device_code: auth_resp.device_code().unwrap_or_default().to_string(),
        client_id,
        client_secret,
        interval: interval as i64,
    })
}

#[tauri::command]
pub async fn aws_sso_poll_token(
    sso_region: String,
    client_id: String,
    client_secret: String,
    device_code: String,
) -> Result<SsoTokenPollResponse, String> {
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new(sso_region))
        .load()
        .await;

    let oidc_client = aws_sdk_ssooidc::Client::new(&config);

    match oidc_client
        .create_token()
        .client_id(&client_id)
        .client_secret(&client_secret)
        .grant_type("urn:ietf:params:oauth:grant-type:device_code")
        .device_code(&device_code)
        .send()
        .await
    {
        Ok(resp) => {
            let token = resp
                .access_token()
                .ok_or_else(|| "No access token returned".to_string())?
                .to_string();
            let expires_in = {
                let val = resp.expires_in();
                if val > 0 {
                    val as u64
                } else {
                    3600
                }
            };
            let expires_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or(Duration::from_secs(0))
                .as_secs()
                + expires_in;

            Ok(SsoTokenPollResponse {
                access_token: Some(token),
                expires_at: Some(expires_at),
                status: "success".to_string(),
                error_message: None,
            })
        }
        Err(e) => {
            let err_str = e.to_string();
            // These are expected during polling — user hasn't authorized yet
            if err_str.contains("AuthorizationPendingException")
                || err_str.contains("SlowDownException")
            {
                Ok(SsoTokenPollResponse {
                    access_token: None,
                    expires_at: None,
                    status: "pending".to_string(),
                    error_message: None,
                })
            } else {
                Ok(SsoTokenPollResponse {
                    access_token: None,
                    expires_at: None,
                    status: "error".to_string(),
                    error_message: Some(err_str),
                })
            }
        }
    }
}

#[tauri::command]
pub async fn aws_sso_get_role_credentials(
    sso_region: String,
    access_token: String,
    account_id: String,
    role_name: String,
) -> Result<CredentialsResponse, String> {
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new(sso_region))
        .load()
        .await;

    let sso_client = aws_sdk_sso::Client::new(&config);

    let resp = sso_client
        .get_role_credentials()
        .access_token(&access_token)
        .account_id(&account_id)
        .role_name(&role_name)
        .send()
        .await
        .map_err(|e| format!("SSO get role credentials failed: {}", e))?;

    let creds = resp
        .role_credentials()
        .ok_or_else(|| "No role credentials returned from SSO".to_string())?;

    let access_key_id = creds.access_key_id().unwrap_or_default().to_string();
    let secret_access_key = creds.secret_access_key().unwrap_or_default().to_string();
    let session_token = creds.session_token().unwrap_or_default().to_string();
    // expiration() returns seconds since epoch (i64 or Option<&i64> depending on SDK version)
    let exp_secs = creds.expiration();
    let expiration_timestamp = (if exp_secs > 0 { exp_secs as u64 } else { 0 }).max(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::from_secs(0))
            .as_secs()
            + 3600,
    );

    Ok(CredentialsResponse {
        access_key_id,
        secret_access_key,
        session_token,
        expiration_timestamp,
    })
}

// ── AWS Profile Listing ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn aws_list_profiles() -> Result<Vec<String>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let aws_dir = std::path::Path::new(&home).join(".aws");
    let credentials_path = aws_dir.join("credentials");
    let config_path = aws_dir.join("config");

    let mut profiles = std::collections::HashSet::new();

    let parse_ini_sections = |path: &std::path::Path| -> Vec<String> {
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };
        content
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
                    return None;
                }
                Some(trimmed[1..trimmed.len() - 1].trim().to_string())
            })
            .collect()
    };

    for section in parse_ini_sections(&credentials_path) {
        profiles.insert(section);
    }

    for section in parse_ini_sections(&config_path) {
        let name = section
            .strip_prefix("profile ")
            .unwrap_or(&section)
            .to_string();
        profiles.insert(name);
    }

    let mut sorted: Vec<String> = profiles.into_iter().collect();
    sorted.sort();
    Ok(sorted)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileWithRole {
    pub profile_name: String,
    pub role_arn: Option<String>,
    pub source_profile: Option<String>,
    pub region: Option<String>,
}

#[tauri::command]
pub async fn aws_list_profiles_with_roles() -> Result<Vec<ProfileWithRole>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let config_path = std::path::Path::new(&home).join(".aws").join("config");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();

    let mut profiles: Vec<ProfileWithRole> = Vec::new();
    let mut current_name: Option<String> = None;
    let mut current_role_arn: Option<String> = None;
    let mut current_source_profile: Option<String> = None;
    let mut current_region: Option<String> = None;

    let flush = |name: Option<String>,
                 role_arn: Option<String>,
                 source_profile: Option<String>,
                 region: Option<String>,
                 acc: &mut Vec<ProfileWithRole>| {
        if let Some(n) = name {
            acc.push(ProfileWithRole {
                profile_name: n,
                role_arn,
                source_profile,
                region,
            });
        }
    };

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            flush(
                current_name.take(),
                current_role_arn.take(),
                current_source_profile.take(),
                current_region.take(),
                &mut profiles,
            );
            let section = &trimmed[1..trimmed.len() - 1];
            current_name = Some(
                section
                    .strip_prefix("profile ")
                    .unwrap_or(section)
                    .trim()
                    .to_string(),
            );
        } else if let Some((k, v)) = trimmed.split_once('=') {
            match k.trim() {
                "role_arn" => current_role_arn = Some(v.trim().to_string()),
                "source_profile" => current_source_profile = Some(v.trim().to_string()),
                "region" => current_region = Some(v.trim().to_string()),
                _ => {}
            }
        }
    }
    flush(
        current_name.take(),
        current_role_arn.take(),
        current_source_profile.take(),
        current_region.take(),
        &mut profiles,
    );

    profiles.sort_by(|a, b| a.profile_name.cmp(&b.profile_name));
    Ok(profiles)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoAccount {
    pub account_id: String,
    pub account_name: String,
    pub email_address: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoRole {
    pub role_name: String,
    pub account_id: String,
}

#[tauri::command]
pub async fn aws_sso_list_accounts(
    sso_region: String,
    access_token: String,
) -> Result<Vec<SsoAccount>, String> {
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new(sso_region))
        .load()
        .await;

    let sso_client = aws_sdk_sso::Client::new(&config);

    let mut accounts: Vec<SsoAccount> = Vec::new();
    let mut paginator = sso_client
        .list_accounts()
        .access_token(&access_token)
        .into_paginator()
        .send();

    while let Some(page) = paginator.next().await {
        let page = page.map_err(|e| format!("SSO list accounts failed: {}", e))?;
        for acct in page.account_list() {
            accounts.push(SsoAccount {
                account_id: acct.account_id().unwrap_or_default().to_string(),
                account_name: acct.account_name().unwrap_or_default().to_string(),
                email_address: acct.email_address().map(|s| s.to_string()),
            });
        }
    }

    accounts.sort_by(|a, b| a.account_name.cmp(&b.account_name));
    Ok(accounts)
}

#[tauri::command]
pub async fn aws_sso_list_roles(
    sso_region: String,
    access_token: String,
    account_id: String,
) -> Result<Vec<SsoRole>, String> {
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(Region::new(sso_region))
        .load()
        .await;

    let sso_client = aws_sdk_sso::Client::new(&config);

    let mut roles: Vec<SsoRole> = Vec::new();
    let mut paginator = sso_client
        .list_account_roles()
        .access_token(&access_token)
        .account_id(&account_id)
        .into_paginator()
        .send();

    while let Some(page) = paginator.next().await {
        let page = page.map_err(|e| format!("SSO list roles failed: {}", e))?;
        for role in page.role_list() {
            roles.push(SsoRole {
                role_name: role.role_name().unwrap_or_default().to_string(),
                account_id: role.account_id().unwrap_or_default().to_string(),
            });
        }
    }

    roles.sort_by(|a, b| a.role_name.cmp(&b.role_name));
    Ok(roles)
}
