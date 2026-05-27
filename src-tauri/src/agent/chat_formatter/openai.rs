use serde_json::{json, Value};

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, StreamDelta, StreamToolCallDelta};

pub struct OpenAIChatFormatter;

impl ChatFormatter for OpenAIChatFormatter {
    fn chat_path(&self) -> &str {
        "/chat/completions"
    }

    fn build_request(
        &self,
        model: &str,
        system_prompt: Option<&str>,
        messages: &[LlmMessage],
        tools: Option<&Value>,
        stream: bool,
    ) -> Value {
        let mut result_messages: Vec<Value> = Vec::new();
        // If system_prompt present, add as {"role": "system", "content": "..."}
        if let Some(sys) = system_prompt {
            if !sys.is_empty() {
                result_messages.push(json!({"role": "system", "content": sys}));
            }
        }
        // Convert each LlmMessage to OpenAI format
        for msg in messages {
            match msg.role.as_str() {
                "user" | "system" => {
                    result_messages
                        .push(json!({"role": msg.role, "content": msg.text_content}));
                }
                "assistant" => {
                    let mut m =
                        json!({"role": "assistant", "content": msg.text_content});
                    if let Some(ref thinking) = msg.thinking {
                        if !thinking.is_empty() {
                            m["reasoning_content"] = Value::String(thinking.clone());
                        }
                    }
                    if let Some(ref calls) = msg.tool_calls {
                        let tc: Vec<Value> = calls
                            .iter()
                            .map(|tc| {
                                json!({
                                    "id": tc.id,
                                    "type": "function",
                                    "function": {
                                        "name": tc.name,
                                        "arguments": tc.arguments
                                    }
                                })
                            })
                            .collect();
                        m["tool_calls"] = Value::Array(tc);
                    }
                    result_messages.push(m);
                }
                "tool" => {
                    result_messages.push(json!({
                        "role": "tool",
                        "tool_call_id": msg.tool_call_id,
                        "content": msg.text_content
                    }));
                }
                _ => result_messages
                    .push(json!({"role": msg.role, "content": msg.text_content})),
            }
        }
        let mut body = json!({
            "model": model,
            "messages": result_messages,
            "stream": stream,
        });
        if let Some(t) = tools {
            if t.is_array()
                && !t.as_array()
                    .map(|a| a.is_empty())
                    .unwrap_or(true)
            {
                body["tools"] = t.clone();
            }
        }
        body
    }

    fn parse_chunk(&self, data: &str) -> Result<StreamDelta, String> {
        if data == "[DONE]" {
            return Ok(StreamDelta {
                content_delta: String::new(),
                thinking_delta: String::new(),
                tool_call_deltas: vec![],
                finish_reason: Some("stop".into()),
            });
        }
        let v: Value =
            serde_json::from_str(data).map_err(|e| format!("JSON parse error: {}", e))?;
        let choice = v
            .get("choices")
            .and_then(|c| c.get(0))
            .ok_or_else(|| "no choices".to_string())?;
        let delta = choice
            .get("delta")
            .ok_or_else(|| "no delta".to_string())?;
        let content = delta
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();
        let thinking = delta
            .get("reasoning_content")
            .or_else(|| delta.get("thinking"))
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();
        let finish_reason = choice
            .get("finish_reason")
            .and_then(|r| r.as_str())
            .map(|s| s.to_string());
        let mut tool_call_deltas = Vec::new();
        if let Some(tcs) = delta
            .get("tool_calls")
            .and_then(|t| t.as_array())
        {
            for tc in tcs {
                let idx = tc
                    .get("index")
                    .and_then(|i| i.as_u64())
                    .unwrap_or(0) as usize;
                let id = tc
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = tc
                    .get("function")
                    .and_then(|f| f.get("name"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                let args = tc
                    .get("function")
                    .and_then(|f| f.get("arguments"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string();
                tool_call_deltas.push(StreamToolCallDelta {
                    index: idx,
                    id,
                    name,
                    arguments_delta: args,
                });
            }
        }
        Ok(StreamDelta {
            content_delta: content,
            thinking_delta: thinking,
            tool_call_deltas,
            finish_reason,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::chat_formatter::{LlmMessage, LlmToolCall};

    #[test]
    fn test_build_request_with_system_and_user() {
        let f = OpenAIChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Hello".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let body = f.build_request("gpt-4", Some("You are helpful."), &msgs, None, true);
        assert_eq!(body["model"], "gpt-4");
        assert_eq!(body["stream"], true);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "You are helpful.");
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(body["messages"][1]["content"], "Hello");
    }

    #[test]
    fn test_build_request_no_system_prompt() {
        let f = OpenAIChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Hi".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let body = f.build_request("gpt-4", None, &msgs, None, false);
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn test_build_request_with_tool_call() {
        let f = OpenAIChatFormatter;
        let msgs = vec![
            LlmMessage {
                role: "assistant".into(),
                text_content: "Let me search".into(),
                tool_calls: Some(vec![
                    LlmToolCall { id: "call_1".into(), name: "search".into(), arguments: r#"{"q":"test"}"#.into() },
                ]),
                tool_call_id: None,
                thinking: Some("I need to find this".into()),
            },
        ];
        let body = f.build_request("gpt-4", None, &msgs, None, true);
        let assistant = &body["messages"][0];
        assert_eq!(assistant["role"], "assistant");
        assert_eq!(assistant["reasoning_content"], "I need to find this");
        assert_eq!(assistant["tool_calls"][0]["function"]["name"], "search");
    }

    #[test]
    fn test_build_request_with_tools_param() {
        let f = OpenAIChatFormatter;
        let msgs = vec![
            LlmMessage { role: "user".into(), text_content: "Search for X".into(), tool_calls: None, tool_call_id: None, thinking: None },
        ];
        let tools = json!([{
            "type": "function",
            "function": { "name": "search", "description": "Search tool", "parameters": { "type": "object" } }
        }]);
        let body = f.build_request("gpt-4", None, &msgs, Some(&tools), true);
        assert!(body["tools"].is_array());
        assert_eq!(body["tools"][0]["function"]["name"], "search");
    }

    #[test]
    fn test_build_request_tool_result() {
        let f = OpenAIChatFormatter;
        let msgs = vec![
            LlmMessage { role: "tool".into(), text_content: "Result data".into(), tool_calls: None, tool_call_id: Some("call_1".into()), thinking: None },
        ];
        let body = f.build_request("gpt-4", None, &msgs, None, true);
        assert_eq!(body["messages"][0]["role"], "tool");
        assert_eq!(body["messages"][0]["tool_call_id"], "call_1");
    }

    #[test]
    fn test_parse_chunk_content_delta() {
        let f = OpenAIChatFormatter;
        let data = r#"{"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.content_delta, "Hello");
        assert!(delta.finish_reason.is_none());
    }

    #[test]
    fn test_parse_chunk_thinking_delta() {
        let f = OpenAIChatFormatter;
        let data = r#"{"choices":[{"index":0,"delta":{"reasoning_content":"thinking..."},"finish_reason":null}]}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.thinking_delta, "thinking...");
    }

    #[test]
    fn test_parse_chunk_tool_calls() {
        let f = OpenAIChatFormatter;
        let data = r#"{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":"{\"q\":\"test\"}"}}]},"finish_reason":"tool_calls"}]}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.tool_call_deltas.len(), 1);
        assert_eq!(delta.tool_call_deltas[0].name, "search");
        assert_eq!(delta.finish_reason, Some("tool_calls".into()));
    }

    #[test]
    fn test_parse_chunk_done() {
        let f = OpenAIChatFormatter;
        let delta = f.parse_chunk("[DONE]").unwrap();
        assert_eq!(delta.finish_reason, Some("stop".into()));
    }

    #[test]
    fn test_parse_chunk_finish_reason() {
        let f = OpenAIChatFormatter;
        let data = r#"{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        let delta = f.parse_chunk(data).unwrap();
        assert_eq!(delta.finish_reason, Some("stop".into()));
    }

    #[test]
    fn test_parse_chunk_invalid_json() {
        let f = OpenAIChatFormatter;
        let result = f.parse_chunk("not json");
        assert!(result.is_err());
    }
}
