use aws_config::meta::region::RegionProviderChain;
use aws_config::profile::ProfileFileCredentialsProvider;
use aws_config::Region;
use aws_sdk_cloudwatch::Client as CloudWatchClient;
use aws_sdk_dynamodb::{config::Credentials, Client as DynamoClient};
use serde_json::Value;

pub(crate) async fn create_dynamo_client(
    config: &Value,
    tunnel_port: Option<u16>,
) -> Result<DynamoClient, String> {
    let region = config
        .get("region")
        .and_then(|v| v.as_str())
        .ok_or("Missing region")?;

    let region_provider = RegionProviderChain::first_try(Region::new(region.to_string()))
        .or_default_provider()
        .or_else("us-east-1");

    let mut config_builder =
        aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);

    // Handle different auth types
    if let Some(auth_kind) = config.get("authKind").and_then(|v| v.as_str()) {
        match auth_kind {
            "accessKey" | "sso" | "assumeRole" => {
                let access_key_id = config
                    .get("accessKeyId")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing accessKeyId")?;
                let secret_access_key = config
                    .get("secretAccessKey")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing secretAccessKey")?;
                let session_token = config
                    .get("sessionToken")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let creds = Credentials::new(
                    access_key_id,
                    secret_access_key,
                    session_token,
                    None,
                    "dockit-agent",
                );
                config_builder = config_builder.credentials_provider(creds);
            }
            "profile" => {
                let profile_name = config
                    .get("profileName")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing profileName")?;
                let profile_provider = ProfileFileCredentialsProvider::builder()
                    .profile_name(profile_name)
                    .build();
                config_builder = config_builder.credentials_provider(profile_provider);
            }
            _ => {
                return Err(format!("Unsupported auth kind: {}", auth_kind));
            }
        }
    } else {
        // Fallback to direct credentials for backward compatibility
        let access_key_id = config
            .get("accessKeyId")
            .and_then(|v| v.as_str())
            .ok_or("Missing accessKeyId")?;
        let secret_access_key = config
            .get("secretAccessKey")
            .and_then(|v| v.as_str())
            .ok_or("Missing secretAccessKey")?;

        let creds = Credentials::new(access_key_id, secret_access_key, None, None, "dockit-agent");
        config_builder = config_builder.credentials_provider(creds);
    }

    // HTTP CONNECT tunnel (AWS SDK official proxy support): keep the REAL
    // endpoint URL (SigV4 signs the real host; TLS/SNI validate against it)
    // and route TCP through the local CONNECT proxy into the SSH tunnel.
    // This is the officially supported way to reach VPC DynamoDB through a
    // bastion — rewriting endpointUrl to 127.0.0.1 would break both TLS
    // (DynamoDB requires TLS 1.2+) and signature verification.
    //
    // ProxyConfig::https matches https:// targets and tunnels them via
    // CONNECT (ProxyConfig::http only matches http:// targets, which would
    // silently bypass the tunnel for AWS DynamoDB). Plain-HTTP DynamoDB
    // Local never reaches this branch: ssh_bridge forces port-forward mode
    // for http:// endpoints, so socks5Proxy is absent here.
    let http_proxy = config
        .get("socks5Proxy")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(proxy) = http_proxy {
        let proxy_url = format!("http://{}", proxy);
        let client = aws_smithy_http_client::Builder::new().build_with_connector_fn(move |_, _| {
            aws_smithy_http_client::Connector::builder()
                .tls_provider(aws_smithy_http_client::tls::Provider::Rustls(
                    aws_smithy_http_client::tls::rustls_provider::CryptoMode::AwsLc,
                ))
                .proxy_config(
                    aws_smithy_http_client::proxy::ProxyConfig::https(&proxy_url)
                        .expect("valid DynamoDB tunnel proxy URL"),
                )
                .build()
        });
        config_builder = config_builder.http_client(client);
        if let Some(endpoint) = config.get("endpointUrl").and_then(|v| v.as_str()) {
            if !endpoint.is_empty() {
                config_builder = config_builder.endpoint_url(endpoint);
            }
        }
    } else if let Some(local_port) = tunnel_port {
        // Port-forward mode: DynamoDB Local (plain HTTP, no TLS/signature).
        config_builder = config_builder.endpoint_url(format!("http://127.0.0.1:{}", local_port));
    } else if let Some(endpoint) = config.get("endpointUrl").and_then(|v| v.as_str()) {
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }
    }

    let aws_config = config_builder.load().await;
    Ok(DynamoClient::new(&aws_config))
}

pub(crate) async fn create_cloudwatch_client(
    config: &Value,
    tunnel_port: Option<u16>,
) -> Result<CloudWatchClient, String> {
    let region = config
        .get("region")
        .and_then(|v| v.as_str())
        .ok_or("Missing region")?;

    let region_provider = RegionProviderChain::first_try(Region::new(region.to_string()))
        .or_default_provider()
        .or_else("us-east-1");

    let mut config_builder =
        aws_config::defaults(aws_config::BehaviorVersion::latest()).region(region_provider);

    // Handle different auth types
    if let Some(auth_kind) = config.get("authKind").and_then(|v| v.as_str()) {
        match auth_kind {
            "accessKey" | "sso" | "assumeRole" => {
                let access_key_id = config
                    .get("accessKeyId")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing accessKeyId")?;
                let secret_access_key = config
                    .get("secretAccessKey")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing secretAccessKey")?;
                let session_token = config
                    .get("sessionToken")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let creds = Credentials::new(
                    access_key_id,
                    secret_access_key,
                    session_token,
                    None,
                    "dockit-agent",
                );
                config_builder = config_builder.credentials_provider(creds);
            }
            "profile" => {
                let profile_name = config
                    .get("profileName")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing profileName")?;
                let profile_provider = ProfileFileCredentialsProvider::builder()
                    .profile_name(profile_name)
                    .build();
                config_builder = config_builder.credentials_provider(profile_provider);
            }
            _ => {
                return Err(format!("Unsupported auth kind: {}", auth_kind));
            }
        }
    } else {
        let access_key_id = config
            .get("accessKeyId")
            .and_then(|v| v.as_str())
            .ok_or("Missing accessKeyId")?;
        let secret_access_key = config
            .get("secretAccessKey")
            .and_then(|v| v.as_str())
            .ok_or("Missing secretAccessKey")?;

        let creds = Credentials::new(access_key_id, secret_access_key, None, None, "dockit-agent");
        config_builder = config_builder.credentials_provider(creds);
    }

    // Apply tunnel endpoint override before the configured endpoint_url
    if let Some(local_port) = tunnel_port {
        config_builder = config_builder.endpoint_url(format!("http://127.0.0.1:{}", local_port));
    } else if let Some(endpoint) = config.get("endpointUrl").and_then(|v| v.as_str()) {
        if !endpoint.is_empty() {
            config_builder = config_builder.endpoint_url(endpoint);
        }
    }

    let aws_config = config_builder.load().await;
    Ok(CloudWatchClient::new(&aws_config))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_create_dynamo_client_access_key() {
        // Explicit credentials + region = no network I/O in config resolution.
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "AKID123",
            "secretAccessKey": "SAK456",
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(
            result.is_ok(),
            "should resolve config with explicit creds: {:?}",
            result.err()
        );
    }

    #[tokio::test]
    async fn test_create_dynamo_client_missing_region() {
        let config = json!({
            "authKind": "accessKey",
            "accessKeyId": "AKID",
            "secretAccessKey": "SAK",
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("region"));
    }

    #[tokio::test]
    async fn test_create_dynamo_client_missing_access_key() {
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            // no accessKeyId
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_dynamo_client_endpoint_url() {
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "AKID",
            "secretAccessKey": "SAK",
            "endpointUrl": "http://localhost:8000",
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(
            result.is_ok(),
            "custom endpoint should not block: {:?}",
            result.err()
        );
    }

    #[tokio::test]
    async fn test_create_dynamo_client_http_connect_proxy() {
        // Socks5/CONNECT mode: real endpoint URL preserved + proxy connector.
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "AKID",
            "secretAccessKey": "SAK",
            "endpointUrl": "https://dynamodb.us-east-1.amazonaws.com",
            "socks5Proxy": "127.0.0.1:51234",
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(
            result.is_ok(),
            "CONNECT proxy mode must build a client: {:?}",
            result.err()
        );
    }

    #[tokio::test]
    async fn test_create_dynamo_client_tunnel_endpoint() {
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "AKID",
            "secretAccessKey": "SAK",
            "endpointUrl": "http://real-host:8000",
        });
        let result = create_dynamo_client(&config, Some(9999)).await;
        assert!(
            result.is_ok(),
            "tunnel endpoint should override: {:?}",
            result.err()
        );
    }

    #[tokio::test]
    async fn test_create_dynamo_client_unsupported_auth() {
        let config = json!({
            "region": "us-east-1",
            "authKind": "unknown_type",
        });
        let result = create_dynamo_client(&config, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported auth kind"));
    }

    #[tokio::test]
    async fn test_create_cloudwatch_client_access_key() {
        let config = json!({
            "region": "us-east-1",
            "authKind": "accessKey",
            "accessKeyId": "AKID",
            "secretAccessKey": "SAK",
        });
        let result = create_cloudwatch_client(&config, None).await;
        assert!(
            result.is_ok(),
            "cloudwatch client with explicit creds: {:?}",
            result.err()
        );
    }
}
