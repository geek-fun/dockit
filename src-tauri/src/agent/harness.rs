use async_openai::types::chat::{
    ChatCompletionMessageToolCall, ChatCompletionRequestMessage, ChatCompletionTools,
    CreateChatCompletionRequestArgs, FinishReason,
};
use async_openai::{config::OpenAIConfig, Client};
use futures::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION};
use serde_json::{json, Value};
use tauri::Emitter;

use crate::common::http_client::create_http_client;

static OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
static DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";
static OPENROUTER_BASE_URL: &str = "https://openrouter.ai/api/v1";
static OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434/v1";

fn get_base_url(provider: &str, base_url: Option<String>) -> String {
    if let Some(explicit) = base_url {
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

fn build_headers(api_key: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if !api_key.is_empty() {
        if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
            headers.insert(AUTHORIZATION, value);
        }
    }
    headers
}

fn extract_model_ids(provider: &str, payload: &Value) -> Vec<String> {
    if provider == "OLLAMA" {
        return payload
            .get("data")
            .and_then(|data| data.as_array())
            .or_else(|| payload.get("models").and_then(|models| models.as_array()))
            .map(|models| {
                models
                    .iter()
                    .filter_map(|model| {
                        model
                            .get("id")
                            .or_else(|| model.get("model"))
                            .and_then(|value| value.as_str())
                            .map(|value| value.to_string())
                    })
                    .collect()
            })
            .unwrap_or_default();
    }

    payload
        .get("data")
        .and_then(|data| data.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|model| model.get("id").and_then(|value| value.as_str()))
                .map(|value| value.to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub async fn run_agent_step(
    window: tauri::Window,
    request_id: String,
    provider: String,
    model: String,
    messages: Vec<Value>,
    tools: Vec<Value>,
    http_proxy: Option<String>,
    api_key: String,
    base_url: Option<String>,
) -> Result<String, String> {
    let resolved_base_url = get_base_url(&provider, base_url);
    let config = OpenAIConfig::new()
        .with_api_key(api_key)
        .with_api_base(resolved_base_url);
    let http_client = create_http_client(http_proxy, None);
    let client = Client::with_config(config).with_http_client(http_client);

    let msgs: Vec<ChatCompletionRequestMessage> =
        serde_json::from_value(Value::Array(messages))
            .map_err(|e| format!("Failed to parse messages: {}", e))?;

    let tool_defs: Vec<ChatCompletionTools> = serde_json::from_value(Value::Array(tools))
        .map_err(|e| format!("Failed to parse tools: {}", e))?;

    let mut builder = CreateChatCompletionRequestArgs::default();
    builder.model(model).stream(true).messages(msgs);

    if !tool_defs.is_empty() {
        builder.tools(tool_defs);
    }

    let request = builder.build().map_err(|e| e.to_string())?;

    let mut stream = client
        .chat()
        .create_stream(request)
        .await
        .map_err(|e| format!("Failed to create stream: {}", e))?;

    let mut tool_calls: Vec<ChatCompletionMessageToolCall> = Vec::new();
    let mut finish_reason_str = String::from("stop");

    while let Some(result) = stream.next().await {
        match result {
            Ok(response) => {
                if let Some(choice) = response.choices.first() {
                    if let Some(ref content) = choice.delta.content {
                        window
                            .emit(
                                "agent-delta",
                                json!({
                                    "requestId": request_id,
                                    "content": content
                                })
                                .to_string(),
                            )
                            .map_err(|e| e.to_string())?;
                    }

                    if let Some(ref chunks) = choice.delta.tool_calls {
                        for chunk in chunks {
                            let index = chunk.index as usize;

                            while tool_calls.len() <= index {
                                tool_calls.push(ChatCompletionMessageToolCall {
                                    id: String::new(),
                                    function: Default::default(),
                                });
                            }

                            let tc = &mut tool_calls[index];
                            if let Some(ref id) = chunk.id {
                                tc.id.clone_from(id);
                            }
                            if let Some(ref func) = chunk.function {
                                if let Some(ref name) = func.name {
                                    tc.function.name.clone_from(name);
                                }
                                if let Some(ref args) = func.arguments {
                                    tc.function.arguments.push_str(args);
                                }
                            }
                        }
                    }

                    if let Some(ref reason) = choice.finish_reason {
                        finish_reason_str = match reason {
                            FinishReason::Stop => "stop".to_string(),
                            FinishReason::ToolCalls => "tool_calls".to_string(),
                            FinishReason::Length => "length".to_string(),
                            FinishReason::ContentFilter => "content_filter".to_string(),
                            _ => format!("{:?}", reason).to_lowercase(),
                        };
                    }
                }
            }
            Err(e) => {
                return Err(format!("Stream error: {}", e));
            }
        }
    }

    let tool_calls_json: Vec<Value> = tool_calls
        .iter()
        .map(|tc| {
            json!({
                "id": tc.id,
                "name": tc.function.name,
                "arguments": tc.function.arguments
            })
        })
        .collect();

    for tc_json in &tool_calls_json {
        window
            .emit(
                "agent-tool-call",
                json!({
                    "requestId": request_id,
                    "id": tc_json["id"],
                    "name": tc_json["name"],
                    "arguments": tc_json["arguments"]
                })
                .to_string(),
            )
            .map_err(|e| e.to_string())?;
    }

    window
        .emit(
            "agent-step-done",
            json!({
                "requestId": request_id,
                "finishReason": finish_reason_str
            })
            .to_string(),
        )
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "finishReason": finish_reason_str,
        "toolCalls": tool_calls_json
    })
    .to_string())
}

#[tauri::command]
pub async fn validate_llm_config(
    provider: String,
    api_key: String,
    model: String,
    http_proxy: Option<String>,
    base_url: Option<String>,
) -> Result<bool, String> {
    let http_client = create_http_client(http_proxy, None);
    let resolved_base_url = get_base_url(&provider, base_url);

    if provider == "OLLAMA" {
        let url = format!("{}/api/tags", resolved_base_url.trim_end_matches("/v1"));
        let response = http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Validation request failed: {}", e))?;

        return Ok(response.status().is_success());
    }

    if provider == "DEEP_SEEK" || provider == "OPENROUTER" {
        let url = format!("{}/models", resolved_base_url);
        let response = http_client
            .get(&url)
            .headers(build_headers(&api_key))
            .send()
            .await
            .map_err(|e| format!("Validation request failed: {}", e))?;

        return Ok(response.status().is_success());
    }

    let url = if model.trim().is_empty() {
        format!("{}/models", resolved_base_url)
    } else {
        format!("{}/models/{}", resolved_base_url, model)
    };

    let request = if api_key.is_empty() {
        http_client.get(&url)
    } else {
        http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", api_key))
    };

    let response = request
        .send()
        .await
        .map_err(|e| format!("Validation request failed: {}", e))?;

    Ok(response.status().is_success())
}

#[tauri::command]
pub async fn list_llm_models(
    provider: String,
    api_key: String,
    http_proxy: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    let http_client = create_http_client(http_proxy, None);
    let resolved_base_url = get_base_url(&provider, base_url);
    let (url, requires_auth) = if provider == "OLLAMA" {
        (format!("{}/api/tags", resolved_base_url.trim_end_matches("/v1")), false)
    } else {
        (format!("{}/models", resolved_base_url), !api_key.is_empty())
    };

    let request = if requires_auth {
        http_client.get(&url).headers(build_headers(&api_key))
    } else {
        http_client.get(&url)
    };

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to list models: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Failed to list models: HTTP {}", response.status()));
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {}", e))?;

    Ok(extract_model_ids(&provider, &payload))
}
