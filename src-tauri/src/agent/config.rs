use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::Value;

static OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
static DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";
static OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";
static OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434/v1";

pub fn get_base_url(settings: &Value) -> String {
    let provider = settings
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let explicit = settings
        .get("baseUrl")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if let Some(explicit) = explicit {
        if !explicit.trim().is_empty() {
            return explicit;
        }
    }

    match provider {
        "DEEP_SEEK" => DEEPSEEK_BASE_URL.to_string(),
        "OPENROUTER" => OPENROUTER_BASE_URL.to_string(),
        "OLLAMA" => OLLAMA_BASE_URL.to_string(),
        _ => OPENAI_BASE_URL.to_string(),
    }
}

pub fn build_headers(settings: &Value) -> Result<HeaderMap, String> {
    let api_key = settings
        .get("apiKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let mut headers = HeaderMap::new();
    if !api_key.is_empty() {
        let value = HeaderValue::from_str(&format!("Bearer {}", api_key))
            .map_err(|e| format!("Invalid api key header: {}", e))?;
        headers.insert(AUTHORIZATION, value);
    }
    Ok(headers)
}
