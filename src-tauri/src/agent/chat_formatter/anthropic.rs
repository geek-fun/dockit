use serde_json::{json, Value};

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, StreamDelta, StreamToolCallDelta};

pub struct AnthropicChatFormatter;

impl ChatFormatter for AnthropicChatFormatter {
    fn chat_path(&self) -> &str {
        "/messages"
    }

    fn build_request(
        &self,
        model: &str,
        system_prompt: Option<&str>,
        messages: &[LlmMessage],
        tools: Option<&Value>,
        stream: bool,
    ) -> Value {
        // Collect system text — from both the explicit system_prompt parameter
        // AND from any system-role LlmMessages in the array. Anthropic requires
        // system content as a top-level "system" field, not in the messages array.
        let mut system_parts = Vec::new();
        if let Some(sys) = system_prompt {
            if !sys.is_empty() {
                system_parts.push(sys.to_string());
            }
        }
        let mut anthropic_msgs: Vec<Value> = Vec::new();
        for msg in messages {
            if msg.role == "system" {
                if !msg.text_content.is_empty() {
                    system_parts.push(msg.text_content.clone());
                }
                continue;
            }
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
        let system_text = system_parts.join("\n");
        if !system_text.is_empty() {
            body["system"] = Value::String(system_text);
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::chat_formatter::{LlmMessage, LlmToolCall};

    #[test]
    fn test_build_request_system_user() {
        let f = AnthropicChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Hello".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let body = f.build_request("claude-sonnet-4", Some("Be helpful."), &msgs, None, true);
        assert_eq!(body["model"], "claude-sonnet-4");
        assert_eq!(body["system"], "Be helpful.");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["messages"][0]["content"][0]["type"], "text");
        assert_eq!(body["messages"][0]["content"][0]["text"], "Hello");
    }

    #[test]
    fn test_build_request_tool_use() {
        let f = AnthropicChatFormatter;
        let msgs = vec![
            LlmMessage {
                role: "assistant".into(),
                text_content: "Using tool".into(),
                tool_calls: Some(vec![
                    LlmToolCall { id: "tu_1".into(), name: "get_weather".into(), arguments: r#"{"city":"Paris"}"#.into() },
                ]),
                tool_call_id: None,
                thinking: None,
            },
        ];
        let body = f.build_request("claude-4", None, &msgs, None, true);
        let content = &body["messages"][0]["content"];
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[0]["text"], "Using tool");
        assert_eq!(content[1]["type"], "tool_use");
        assert_eq!(content[1]["id"], "tu_1");
        assert_eq!(content[1]["name"], "get_weather");
        assert_eq!(content[1]["input"]["city"], "Paris");
    }

    #[test]
    fn test_build_request_tool_result() {
        let f = AnthropicChatFormatter;
        let msgs = vec![
            LlmMessage { role: "tool".into(), text_content: "Sunny 25C".into(), tool_calls: None, tool_call_id: Some("tu_1".into()), thinking: None },
        ];
        let body = f.build_request("claude-4", None, &msgs, None, true);
        let msg = &body["messages"][0];
        assert_eq!(msg["role"], "user");
        assert_eq!(msg["content"][0]["type"], "tool_result");
        assert_eq!(msg["content"][0]["tool_use_id"], "tu_1");
        assert_eq!(msg["content"][0]["content"], "Sunny 25C");
    }

    #[test]
    fn test_build_request_with_tools_param() {
        let f = AnthropicChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Get weather".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let tools = json!([{
            "type": "function",
            "function": { "name": "get_weather", "description": "Get weather", "parameters": {"type": "object", "properties": {"city": {"type": "string"}} } }
        }]);
        let body = f.build_request("claude-4", None, &msgs, Some(&tools), false);
        assert!(body["tools"].is_array());
        assert_eq!(body["tools"][0]["name"], "get_weather");
        assert!(body["tools"][0]["input_schema"].is_object());
    }

    #[test]
    fn test_build_request_no_system() {
        let f = AnthropicChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Hi".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let body = f.build_request("claude-4", None, &msgs, None, false);
        assert!(body.get("system").is_none());
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn test_parse_chunk_content_block_delta() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.content_delta, "Hello");
        assert!(delta.finish_reason.is_none());
    }

    #[test]
    fn test_parse_chunk_tool_use_start() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"get_weather","input":{}}}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.tool_call_deltas.len(), 1);
        assert_eq!(delta.tool_call_deltas[0].id, "tu_1");
        assert_eq!(delta.tool_call_deltas[0].name, "get_weather");
    }

    #[test]
    fn test_parse_chunk_input_json_delta() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"input_json_delta","index":0,"delta":{"partial_json":"{\"city\":\"Paris\"}"}}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.tool_call_deltas[0].arguments_delta, "{\"city\":\"Paris\"}");
    }

    #[test]
    fn test_parse_chunk_message_delta() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null}}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.finish_reason, Some("end_turn".into()));
    }

    #[test]
    fn test_parse_chunk_message_stop() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"message_stop"}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.finish_reason, Some("end_turn".into()));
    }

    #[test]
    fn test_parse_chunk_ping() {
        let f = AnthropicChatFormatter;
        let delta = f.parse_chunk(r#"{"type":"ping"}"#).unwrap();
        assert!(delta.content_delta.is_empty());
        assert!(delta.finish_reason.is_none());
    }

    #[test]
    fn test_parse_chunk_content_block_stop() {
        let f = AnthropicChatFormatter;
        let delta = f.parse_chunk(r#"{"type":"content_block_stop","index":0}"#).unwrap();
        assert!(delta.content_delta.is_empty());
    }

    #[test]
    fn test_parse_chunk_error() {
        let f = AnthropicChatFormatter;
        let data = r#"{"type":"error","error":{"message":"Invalid API key"}}"#;
        let result = f.parse_chunk(data);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid API key"));
    }

    #[test]
    fn test_parse_chunk_data_prefix() {
        let f = AnthropicChatFormatter;
        let data = r#"data: {"type":"message_stop"}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.finish_reason, Some("end_turn".into()));
    }
}
