use std::time::Duration;

use reqwest::header::HeaderValue;
use serde_json::json;

const CLOUDGPU_HOST: &str = "cloudgpu.app";
const CLOUDGPU_DEFAULT_BASE: &str = "https://cloudgpu.app/v1";
const CLOUDGPU_PROBE_MODEL: &str = "deepseek-v4.1-flash";

pub(crate) fn uses_cloudgpu_credential_probe(provider: &str, base_url: Option<&str>) -> bool {
    provider.eq_ignore_ascii_case("cloudgpu") || cloudgpu_host(base_url)
}

pub(crate) async fn validate_llm_config(
    provider: String,
    api_key: String,
    model: String,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    base_url: Option<String>,
) -> Result<bool, String> {
    if uses_cloudgpu_credential_probe(&provider, base_url.as_deref()) {
        return validate_cloudgpu_credentials(
            &api_key,
            &model,
            http_proxy,
            proxy_mode,
            base_url.as_deref(),
        )
        .await;
    }

    data_studio_agent::harness::validate_llm_config(
        provider, api_key, model, http_proxy, proxy_mode, base_url,
    )
    .await
}

fn cloudgpu_host(base_url: Option<&str>) -> bool {
    base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| url::Url::parse(value).ok())
        .and_then(|parsed| {
            parsed
                .host_str()
                .map(|host| host.eq_ignore_ascii_case(CLOUDGPU_HOST))
        })
        .unwrap_or(false)
}

fn cloudgpu_base_url(base_url: Option<&str>) -> String {
    let explicit = base_url.map(str::trim).filter(|value| !value.is_empty());
    let settings = json!({
        "apiCompatibility": "openai-compatible",
        "baseUrl": explicit.unwrap_or(CLOUDGPU_DEFAULT_BASE),
    });
    data_studio_agent::get_base_url(&settings)
}

fn chat_completions_url(base_url: Option<&str>) -> String {
    format!(
        "{}/chat/completions",
        cloudgpu_base_url(base_url).trim_end_matches('/')
    )
}

fn probe_model(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        CLOUDGPU_PROBE_MODEL.to_string()
    } else {
        trimmed.to_string()
    }
}

fn redact_secret(message: String, api_key: &str) -> String {
    if api_key.len() < 8 {
        message
    } else {
        message.replace(api_key, "[REDACTED]")
    }
}

fn credential_result(status: u16) -> Result<bool, String> {
    match status {
        200..=299 => Ok(true),
        401 | 403 => Err(format!("HTTP {status} — invalid API key.")),
        _ => Err(format!(
            "HTTP {status} — verify your API key and provider settings."
        )),
    }
}

async fn validate_cloudgpu_credentials(
    api_key: &str,
    model: &str,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    base_url: Option<&str>,
) -> Result<bool, String> {
    let authorization = HeaderValue::from_str(&format!("Bearer {api_key}"))
        .map_err(|_| "Invalid API key.".to_string())?;
    let client = crate::common::http_client::create_http_client(
        proxy_mode.as_deref().unwrap_or("system"),
        http_proxy,
        None,
        Some(Duration::from_secs(30)),
        None,
        None,
    );
    let response = client
        .post(chat_completions_url(base_url))
        .header(reqwest::header::AUTHORIZATION, authorization)
        .json(&json!({
            "model": probe_model(model),
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }))
        .send()
        .await
        .map_err(|err| redact_secret(format!("Validation request failed: {err}"), api_key))?;

    credential_result(response.status().as_u16())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn base_url(server: &MockServer) -> String {
        format!("{}/v1", server.uri())
    }

    async fn mount_public_catalog(server: &MockServer) {
        Mock::given(method("GET"))
            .and(path("/v1/models"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": [{"id": "deepseek-v4.1-flash"}]
            })))
            .mount(server)
            .await;
    }

    async fn mount_chat(server: &MockServer, status: u16, body: serde_json::Value) {
        Mock::given(method("POST"))
            .and(path("/v1/chat/completions"))
            .respond_with(ResponseTemplate::new(status).set_body_json(body))
            .mount(server)
            .await;
    }

    #[test]
    fn probe_matches_cloudgpu_provider_or_host_only() {
        assert!(uses_cloudgpu_credential_probe("cloudgpu", None));
        assert!(uses_cloudgpu_credential_probe(
            "CLOUDGPU",
            Some("https://example.test/v1")
        ));
        assert!(uses_cloudgpu_credential_probe(
            "openai-compatible",
            Some("https://cloudgpu.app/v1")
        ));
        assert!(uses_cloudgpu_credential_probe(
            "openai-compatible",
            Some("https://cloudgpu.app/v1/")
        ));
        assert!(!uses_cloudgpu_credential_probe(
            "openai-compatible",
            Some("https://api.example.test/v1")
        ));
        assert!(!uses_cloudgpu_credential_probe(
            "openai-compatible",
            Some("https://notcloudgpu.app/v1")
        ));
        assert!(!uses_cloudgpu_credential_probe("anthropic", None));
    }

    #[test]
    fn chat_probe_url_appends_completions_once() {
        assert_eq!(
            chat_completions_url(Some("https://cloudgpu.app/v1")),
            "https://cloudgpu.app/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url(Some("https://cloudgpu.app")),
            "https://cloudgpu.app/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url(Some("https://cloudgpu.app/v1/")),
            "https://cloudgpu.app/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url(None),
            "https://cloudgpu.app/v1/chat/completions"
        );
    }

    #[test]
    fn credential_status_treats_401_and_403_as_invalid_keys() {
        assert_eq!(
            credential_result(401).unwrap_err(),
            "HTTP 401 — invalid API key."
        );
        assert_eq!(
            credential_result(403).unwrap_err(),
            "HTTP 403 — invalid API key."
        );
        assert!(credential_result(200).unwrap());
        assert_eq!(
            credential_result(500).unwrap_err(),
            "HTTP 500 — verify your API key and provider settings."
        );
    }

    #[test]
    fn redact_secret_hides_long_keys() {
        assert_eq!(
            redact_secret("key sk-live-12345678 leaked".into(), "sk-live-12345678"),
            "key [REDACTED] leaked"
        );
        assert_eq!(redact_secret("short key".into(), "short"), "short key");
    }

    #[tokio::test]
    async fn public_model_list_does_not_validate_invalid_cloudgpu_key() {
        let server = MockServer::start().await;
        mount_public_catalog(&server).await;
        mount_chat(
            &server,
            401,
            json!({
                "error": {
                    "type": "authentication_error",
                    "code": "invalid_api_key",
                    "message": "The provided API key is invalid or has been revoked."
                }
            }),
        )
        .await;

        let result = validate_llm_config(
            "cloudgpu".to_string(),
            "invalid-review-test-key".to_string(),
            String::new(),
            None,
            Some("none".to_string()),
            Some(base_url(&server)),
        )
        .await;

        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(
            result.unwrap_err(),
            "HTTP 401 — invalid API key.",
            "a public model catalog must not validate a rejected key"
        );
        assert_eq!(requests.len(), 1, "validation must not stop at GET /models");
        assert_eq!(requests[0].method, "POST");
        assert_eq!(requests[0].url.path(), "/v1/chat/completions");
        assert_eq!(
            requests[0]
                .headers
                .get(reqwest::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer invalid-review-test-key")
        );
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("chat body is JSON");
        assert_eq!(body["model"], "deepseek-v4.1-flash");
        assert_eq!(body["max_tokens"], 1);
    }

    #[tokio::test]
    async fn cloudgpu_forbidden_response_is_an_invalid_key() {
        let server = MockServer::start().await;
        mount_public_catalog(&server).await;
        mount_chat(&server, 403, json!({"error": {"code": "forbidden"}})).await;

        let err = validate_llm_config(
            "cloudgpu".to_string(),
            "revoked-cloudgpu-key".to_string(),
            "kimi-k3".to_string(),
            None,
            Some("none".to_string()),
            Some(base_url(&server)),
        )
        .await
        .unwrap_err();

        assert_eq!(err, "HTTP 403 — invalid API key.");
    }

    #[tokio::test]
    async fn cloudgpu_chat_success_validates_without_a_model_list() {
        let server = MockServer::start().await;
        mount_chat(
            &server,
            200,
            json!({"choices": [{"message": {"role": "assistant", "content": "p"}}]}),
        )
        .await;

        let result = validate_llm_config(
            "cloudgpu".to_string(),
            "valid-looking-key".to_string(),
            "kimi-k3".to_string(),
            None,
            Some("none".to_string()),
            Some(base_url(&server)),
        )
        .await;

        assert!(result.unwrap());
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].url.path(), "/v1/chat/completions");
        let body: serde_json::Value =
            serde_json::from_slice(&requests[0].body).expect("chat body is JSON");
        assert_eq!(body["model"], "kimi-k3");
    }

    #[tokio::test]
    async fn other_providers_still_accept_a_models_response() {
        let server = MockServer::start().await;
        mount_public_catalog(&server).await;

        let result = validate_llm_config(
            "openai-compatible".to_string(),
            "other-provider-key".to_string(),
            "some-model".to_string(),
            None,
            Some("none".to_string()),
            Some(base_url(&server)),
        )
        .await;

        assert!(result.unwrap());
        let requests = server.received_requests().await.expect("recorded requests");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].url.path(), "/v1/models");
    }

    #[tokio::test]
    async fn cloudgpu_server_error_is_not_an_invalid_key() {
        let server = MockServer::start().await;
        mount_chat(&server, 500, json!({"error": "unavailable"})).await;

        let err = validate_llm_config(
            "cloudgpu".to_string(),
            "valid-looking-key".to_string(),
            "deepseek-v4.1-flash".to_string(),
            None,
            Some("none".to_string()),
            Some(base_url(&server)),
        )
        .await
        .unwrap_err();

        assert_eq!(err, "HTTP 500 — verify your API key and provider settings.");
    }

    #[tokio::test]
    async fn malformed_cloudgpu_key_is_rejected_before_the_request() {
        let err = validate_cloudgpu_credentials(
            "bad\nkey",
            "deepseek-v4.1-flash",
            None,
            Some("none".to_string()),
            Some("http://127.0.0.1:9/v1"),
        )
        .await
        .unwrap_err();

        assert_eq!(err, "Invalid API key.");
    }
}
