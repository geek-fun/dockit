pub mod openai;
pub mod anthropic;

pub use self::openai::OpenAIChatFormatter;
pub use self::anthropic::AnthropicChatFormatter;

/// Provider-agnostic message representation.
pub struct LlmMessage {
    pub role: String,
    pub text_content: String,
    pub tool_calls: Option<Vec<LlmToolCall>>,
    pub tool_call_id: Option<String>,
    pub thinking: Option<String>,
}

pub struct LlmToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// A single SSE event parsed by a ChatFormatter.
/// Not all fields are populated on every event — the accumulator merges them.
#[derive(Default, Debug)]
pub struct StreamDelta {
    pub content_delta: String,
    pub thinking_delta: String,
    pub tool_call_deltas: Vec<StreamToolCallDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Default, Debug)]
pub struct StreamToolCallDelta {
    pub index: usize,
    pub id: String,
    pub name: String,
    pub arguments_delta: String,
}

/// Provider-agnostic formatter trait.
pub trait ChatFormatter: Send + Sync {
    /// The URL path for chat completions (e.g. "/v1/chat/completions", "/v1/messages")
    fn chat_path(&self) -> &str;

    /// Build the HTTP request body from the internal message representation.
    fn build_request(
        &self,
        model: &str,
        system_prompt: Option<&str>,
        messages: &[LlmMessage],
        tools: Option<&serde_json::Value>,
        stream: bool,
    ) -> serde_json::Value;

    /// Parse a single SSE "data:" line into a StreamDelta.
    fn parse_chunk(&self, data: &str) -> Result<StreamDelta, String>;
}
