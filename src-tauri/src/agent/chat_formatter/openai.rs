use serde_json::{json, Value};

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, StreamDelta, StreamToolCallDelta};

pub struct OpenAIChatFormatter;

impl ChatFormatter for OpenAIChatFormatter {
    fn chat_path(&self) -> &str {
        "/v1/chat/completions"
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

    fn format_tools(&self, tools: &Value) -> Value {
        tools.clone()
    }
}
