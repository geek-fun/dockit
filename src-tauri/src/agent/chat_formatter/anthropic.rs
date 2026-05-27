use serde_json::{json, Value};

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, StreamDelta, StreamToolCallDelta};

pub struct AnthropicChatFormatter;

impl ChatFormatter for AnthropicChatFormatter {
    fn chat_path(&self) -> &str {
        "/v1/messages"
    }

    fn build_request(
        &self,
        model: &str,
        system_prompt: Option<&str>,
        messages: &[LlmMessage],
        tools: Option<&Value>,
        stream: bool,
    ) -> Value {
        let mut anthropic_msgs: Vec<Value> = Vec::new();
        for msg in messages {
            match msg.role.as_str() {
                "user" => {
                    anthropic_msgs.push(json!({
                        "role": "user",
                        "content": [{"type": "text", "text": msg.text_content}]
                    }));
                }
                "assistant" => {
                    let mut content: Vec<Value> = vec![];
                    if !msg.text_content.is_empty() {
                        content
                            .push(json!({"type": "text", "text": msg.text_content}));
                    }
                    if let Some(ref tool_calls) = msg.tool_calls {
                        for tc in tool_calls {
                            let args: Value =
                                serde_json::from_str(&tc.arguments).unwrap_or(json!({}));
                            content.push(json!({
                                "type": "tool_use",
                                "id": tc.id,
                                "name": tc.name,
                                "input": args
                            }));
                        }
                    }
                    anthropic_msgs.push(json!({"role": "assistant", "content": content}));
                }
                "tool" => {
                    anthropic_msgs.push(json!({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": msg.tool_call_id,
                            "content": msg.text_content
                        }]
                    }));
                }
                _ => {
                    anthropic_msgs.push(json!({
                        "role": msg.role,
                        "content": [{"type": "text", "text": msg.text_content}]
                    }));
                }
            }
        }
        let mut body = json!({
            "model": model,
            "messages": anthropic_msgs,
            "stream": stream,
            "max_tokens": 4096,
        });
        if let Some(sys) = system_prompt {
            if !sys.is_empty() {
                body["system"] = Value::String(sys.to_string());
            }
        }
        if let Some(t) = tools {
            if t.is_array()
                && !t.as_array()
                    .map(|a| a.is_empty())
                    .unwrap_or(true)
            {
                let formatted: Vec<Value> = t
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|tool| {
                        let f = tool.get("function")?;
                        Some(json!({
                            "name": f.get("name")?.as_str()?,
                            "description": f.get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or(""),
                            "input_schema": f.get("parameters")
                                .cloned()
                                .unwrap_or(json!({"type": "object", "properties": {}}))
                        }))
                    })
                    .collect();
                body["tools"] = Value::Array(formatted);
            }
        }
        body
    }

    fn parse_chunk(&self, data: &str) -> Result<StreamDelta, String> {
        // Anthropic SSE format: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
        if data == "[DONE]" {
            return Ok(StreamDelta {
                content_delta: String::new(),
                thinking_delta: String::new(),
                tool_call_deltas: vec![],
                finish_reason: Some("end_turn".into()),
            });
        }
        // Strip "data: " prefix if present
        let raw = data.strip_prefix("data: ").unwrap_or(data);
        let v: Value = serde_json::from_str(raw)
            .map_err(|e| format!("JSON parse error: {}", e))?;
        let event_type = v
            .get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("");
        match event_type {
            "content_block_delta" => {
                let delta = v.get("delta").ok_or("no delta")?;
                let text = delta
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                Ok(StreamDelta {
                    content_delta: text,
                    thinking_delta: String::new(),
                    tool_call_deltas: vec![],
                    finish_reason: None,
                })
            }
            "content_block_start" => {
                // Could be tool_use block start
                let block = v
                    .get("content_block")
                    .ok_or("no content_block")?;
                if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    let idx = v
                        .get("index")
                        .and_then(|i| i.as_u64())
                        .unwrap_or(0) as usize;
                    let id = block
                        .get("id")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    Ok(StreamDelta {
                        content_delta: String::new(),
                        thinking_delta: String::new(),
                        tool_call_deltas: vec![StreamToolCallDelta {
                            index: idx,
                            id,
                            name,
                            arguments_delta: String::new(),
                        }],
                        finish_reason: None,
                    })
                } else {
                    Ok(StreamDelta::default())
                }
            }
            "input_json_delta" => {
                let partial = v
                    .get("delta")
                    .and_then(|d| d.get("partial_json"))
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string();
                let idx = v
                    .get("index")
                    .and_then(|i| i.as_u64())
                    .unwrap_or(0) as usize;
                Ok(StreamDelta {
                    content_delta: String::new(),
                    thinking_delta: String::new(),
                    tool_call_deltas: vec![StreamToolCallDelta {
                        index: idx,
                        id: String::new(),
                        name: String::new(),
                        arguments_delta: partial,
                    }],
                    finish_reason: None,
                })
            }
            "message_delta" => {
                let stop = v
                    .get("delta")
                    .and_then(|d| d.get("stop_reason"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                Ok(StreamDelta {
                    content_delta: String::new(),
                    thinking_delta: String::new(),
                    tool_call_deltas: vec![],
                    finish_reason: stop,
                })
            }
            "message_stop" => Ok(StreamDelta {
                content_delta: String::new(),
                thinking_delta: String::new(),
                tool_call_deltas: vec![],
                finish_reason: Some("end_turn".into()),
            }),
            "ping" => Ok(StreamDelta::default()),
            "content_block_stop" => Ok(StreamDelta::default()),
            _ => {
                // Try to extract error or unknown
                if v.get("error").is_some() {
                    let msg = v
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown Anthropic error");
                    Err(format!("Anthropic API error: {}", msg))
                } else {
                    // Unknown event type — skip silently (streaming has many event types)
                    Ok(StreamDelta::default())
                }
            }
        }
    }

    fn format_tools(&self, tools: &Value) -> Value {
        // Anthropic uses {name, description, input_schema} format
        if let Some(arr) = tools.as_array() {
            let formatted: Vec<Value> = arr
                .iter()
                .filter_map(|tool| {
                    let f = tool.get("function")?;
                    Some(json!({
                        "name": f.get("name")?.as_str()?,
                        "description": f.get("description")
                            .and_then(|d| d.as_str())
                            .unwrap_or(""),
                        "input_schema": f.get("parameters")
                            .cloned()
                            .unwrap_or(json!({"type": "object", "properties": {}}))
                    }))
                })
                .collect();
            return Value::Array(formatted);
        }
        json!([])
    }
}
