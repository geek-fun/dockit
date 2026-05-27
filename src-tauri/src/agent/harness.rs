use async_openai::types::chat::{
    ChatCompletionMessageToolCall, ChatCompletionRequestMessage, ChatCompletionTools,
    CreateChatCompletionRequestArgs, FinishReason,
};
use async_openai::{config::OpenAIConfig, Client};
use futures::StreamExt;
use serde_json::{json, Value};
use tauri::Emitter;

use crate::agent::provider_adapter;
use crate::common::http_client::create_http_client;
use std::time::Duration;

fn sanitize_error(msg: String, api_key: &str) -> String {
    if api_key.is_empty() || api_key.len() < 8 {
        return msg;
    }
    msg.replace(api_key, "[REDACTED]")
}

/// Build a minimal settings value from a legacy provider string and optional
/// base URL, suitable for passing to `provider_adapter::get_base_url`.
fn make_settings(provider: &str, base_url: Option<String>, api_key: &str) -> Value {
    json!({
        "apiCompatibility": provider_adapter::map_to_api_compatibility(provider),
        "baseUrl": base_url,
        "apiKey": api_key,
    })
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
    proxy_mode: Option<String>,
    api_key: String,
    base_url: Option<String>,
) -> Result<String, String> {
    let settings = make_settings(&provider, base_url, &api_key);
    let normalized_base_url = provider_adapter::get_base_url(&settings);

    // Anthropic streaming path — raw HTTP request
    let api_compat = provider_adapter::map_to_api_compatibility(&provider);
    if api_compat == "anthropic" {
        let http_client = create_http_client(
            proxy_mode.as_deref().unwrap_or("system"),
            http_proxy,
            None,
            None,
        );
        let anthropic_url = format!("{}{}", normalized_base_url.trim_end_matches('/'), "/v1/messages");

        // Build Anthropic request body
        let request_body = json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "max_tokens": 4096,
        });

        let response = http_client
            .post(&anthropic_url)
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic HTTP {}: {}", status, text));
        }

        // Read streaming response
        let mut stream = response.bytes_stream();
        let mut buf = String::new();
        let mut full_content = String::new();

        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Stream error: {}", e))?;
            let s = String::from_utf8_lossy(&bytes);
            buf.push_str(&s);

            while let Some(pos) = buf.find("\n\n") {
                let event_block = buf[..pos].to_string();
                buf.drain(..pos + 2);

                for line in event_block.lines() {
                    let line = line.trim();
                    if !line.starts_with("data:") { continue; }
                    let data = line[5..].trim();
                    if data == "[DONE]" { break; }

                    // Parse Anthropic event types
                    let v: Value = serde_json::from_str(data).unwrap_or(json!({}));
                    if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
                        if let Some(text) = v.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()) {
                            full_content.push_str(text);
                            let _ = window.emit("agent-delta", json!({"requestId": request_id, "content": text}).to_string());
                        }
                    }
                }
            }
        }

        let _ = window.emit("agent-step-done", json!({"requestId": request_id, "finishReason": "stop"}).to_string());
        return Ok(json!({"finishReason": "stop", "toolCalls": []}).to_string());
    }

    let config = OpenAIConfig::new()
        .with_api_key(&api_key)
        .with_api_base(normalized_base_url);
    let http_client = create_http_client(
        proxy_mode.as_deref().unwrap_or("system"),
        http_proxy,
        None,
        None,
    );
    let client = Client::with_config(config).with_http_client(http_client);

    let msgs: Vec<ChatCompletionRequestMessage> = serde_json::from_value(Value::Array(messages))
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
                return Err(sanitize_error(format!("Stream error: {}", e), &api_key));
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
    proxy_mode: Option<String>,
    base_url: Option<String>,
) -> Result<bool, String> {
    let _ = model;
    let http_client = create_http_client(
        proxy_mode.as_deref().unwrap_or("system"),
        http_proxy,
        None,
        Some(Duration::from_secs(30)),
    );
    let settings = make_settings(&provider, base_url, &api_key);
    let normalized_base_url = provider_adapter::get_base_url(&settings);
    let api_compatibility = provider_adapter::map_to_api_compatibility(&provider);

    // Local providers (Ollama) use native API for validation
    if api_compatibility == "local" {
        let url = provider_adapter::get_native_api_url(
            "OLLAMA",
            &normalized_base_url,
            "api/tags",
        );
        let response = http_client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Validation request failed: {}", e))?;
        let status = response.status();
        if status.is_success() {
            return Ok(true);
        }
        return Err(format!("HTTP {} — verify Ollama is running.", status.as_u16()));
    }

    // Anthropic requires x-api-key header and /v1/messages endpoint
    // Full Anthropic native adapter is not yet implemented — reject validation
    if api_compatibility == "anthropic" {
        return Err("Anthropic native adapter is not yet implemented. Use OpenRouter to access Anthropic models.".to_string());
    }

    // All openai-compatible providers: validate via /v1/models
    // Always hit the list endpoint — per-model detail (/v1/models/{id}) is
    // not supported by OpenRouter and other non-OpenAI providers.
    let url = format!("{}/models", normalized_base_url);

    let request = http_client
        .get(&url)
        .headers(provider_adapter::build_headers(&settings)?);

    let response = request
        .send()
        .await
        .map_err(|e| format!("Validation request failed: {}", e))?;

    let status = response.status();
    if status.is_success() {
        Ok(true)
    } else {
        Err(format!("HTTP {} — verify your API key and provider settings.", status.as_u16()))
    }
}

#[tauri::command]
pub async fn list_llm_models(
    provider: String,
    api_key: String,
    http_proxy: Option<String>,
    proxy_mode: Option<String>,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    let http_client = create_http_client(
        proxy_mode.as_deref().unwrap_or("system"),
        http_proxy,
        None,
        Some(Duration::from_secs(60)),
    );
    let settings = make_settings(&provider, base_url, &api_key);
    let normalized_base_url = provider_adapter::get_base_url(&settings);
    let api_compatibility = provider_adapter::map_to_api_compatibility(&provider);

    let (url, requires_auth) = match api_compatibility {
        "local" => (
            provider_adapter::get_native_api_url("OLLAMA", &normalized_base_url, "api/tags"),
            false,
        ),
        "anthropic" => {
            return Err(
                "Anthropic native adapter is not yet implemented. Use OpenRouter to access Anthropic models."
                    .to_string(),
            );
        }
        _ => (
            format!("{}/models", normalized_base_url),
            !api_key.is_empty(),
        ),
    };

    let request = if requires_auth {
        http_client
            .get(&url)
            .headers(provider_adapter::build_headers(&settings)?)
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

    Ok(provider_adapter::extract_model_ids(
        &api_compatibility,
        &payload,
    ))
}
