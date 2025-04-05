use async_openai::types::{
    ChatCompletionRequestAssistantMessageArgs,
    ChatCompletionRequestMessage,
    ChatCompletionRequestUserMessageArgs,
    CreateChatCompletionRequestArgs,
};
use async_openai::{config::OpenAIConfig, Client};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tauri::Emitter;

use crate::common::http_client::create_http_client;

static OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
static DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";

static mut AI_CLIENT: Option<Client<OpenAIConfig>> = None;

#[derive(Debug, Deserialize, Clone)]
pub enum MessageStatus {
    #[serde(rename = "SENDING")]
    Sending,
    #[serde(rename = "SENT")]
    Sent,
    #[serde(rename = "FAILED")]
    Failed,
    #[serde(rename = "RECEIVED")]
    Received,
}

#[derive(Debug, Deserialize, Clone)]
pub enum ChatMessageRole {
    #[serde(rename = "USER")]
    User,
    #[serde(rename = "BOT")]
    Bot,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatMessage {
    pub id: String,
    pub status: MessageStatus,
    pub content: String,
    pub role: ChatMessageRole,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Chat {
    pub id: String,
    pub provider: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Deserialize)]
pub struct ChatStore {
    #[serde(rename = "activeChat")]
    pub active_chat: Option<Chat>,
    pub chats: Vec<Chat>,
}

fn get_base_url(provider: &str) -> &'static str {
    match provider {
        "DEEP_SEEK" => DEEPSEEK_BASE_URL,
        _ => OPENAI_BASE_URL, // Default to OpenAI for any other provider
    }
}

async fn validate_openai(provider: &str, api_key: &str, model: &str, proxy: Option<String>) -> bool {
    let http_client = create_http_client(proxy, None);
    let url = format!("{}/models/{}", get_base_url(provider), model);

    let resp = http_client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await;

    match resp {
        Ok(response) => response.status().is_success(),
        Err(_err) => false,
    }
}


#[tauri::command]
pub async fn create_openai_client(
    provider: String,
    api_key: String,
    model: String,
    http_proxy: Option<String>,
) -> Result<String, String> {
    let is_valid = validate_openai(&provider, &api_key, &model, http_proxy.clone()).await;
    if !is_valid {
        return Err(format!("Invalid {} API Key or Model", provider).into());
    }

    let config = OpenAIConfig::new()
        .with_api_key(api_key)
        .with_api_base(get_base_url(&provider));

    let http_client = create_http_client(http_proxy, None);
    unsafe {
        AI_CLIENT = Option::from(Client::with_config(config).with_http_client(http_client));
    }

    return Ok(format!("{} client created", provider).to_string());
}

#[tauri::command]
pub async fn chat_stream(
    window: tauri::Window,
    provider: String,
    model: String,
    question: String,
     history: Vec<ChatMessage>
) -> Result<String, String> {
    // Get client from static reference
    let openai_client = match unsafe { AI_CLIENT.as_ref() } {
        Some(client) => client.clone(),
        None => {
            let result = json!({
                "status": 500,
                "message": format!("{} client not found", provider),
                "data": Option::<serde_json::Value>::None,
            });
            return Err(result.to_string());
        }
    };
     // Convert history to OpenAI message format
        let mut messages: Vec<ChatCompletionRequestMessage> = Vec::new();
        for chat_msg in &history {
            let api_message = match chat_msg.role {
                ChatMessageRole::User => {
                    ChatCompletionRequestUserMessageArgs::default()
                        .content(chat_msg.content.clone())
                        .build()
                        .map_err(|e| e.to_string())?
                        .into()
                }
                ChatMessageRole::Bot => {
                    ChatCompletionRequestAssistantMessageArgs::default()
                        .content(chat_msg.content.clone())
                        .build()
                        .map_err(|e| e.to_string())?
                        .into()
                }
            };
            messages.push(api_message);
        }

        // Add the new user message
        messages.push(
            ChatCompletionRequestUserMessageArgs::default()
                .content(question)
                .build()
                .map_err(|e| e.to_string())?
                .into()
        );

    // Create and send the request
    let request = CreateChatCompletionRequestArgs::default()
        .model(model.clone())
        .stream(true)
        .messages([ChatCompletionRequestUserMessageArgs::default()
                    .content("Write a marketing blog praising and introducing Rust library async-openai")
                    .build()
                                    .map_err(|e| e.to_string())?
                    .into()])
        .build()
        .map_err(|e| e.to_string())?;

// Print request details for debugging
println!("Request details:");
println!("  Provider: {}", provider);
println!("  Model: {}", model.clone());
println!("  Stream: true");
println!("  Messages count: {}", request.messages.len());
// Add full messages as JSON for debugging
println!("Full messages content:");
match serde_json::to_string_pretty(&request.messages) {
    Ok(json_str) => println!("{}", json_str),
    Err(e) => println!("Error serializing messages: {}", e),
}

    // Initialize the stream from OpenAI
let mut stream = match openai_client.chat().create_stream(request).await {
    Ok(stream) => stream,
    Err(e) => {
 println!("Stream creation error details: {:?}", e);
        let result = json!({
            "status": 500,
            "message": format!("stream failed: {}", e),
            "data": Option::<serde_json::Value>::None,
        });
        return Err(result.to_string());
    }
};
// Process the stream
let mut full_response = String::new();
let mut is_first_message = true;

// Process stream events
while let Some(result) = stream.next().await {
    match result {
        Ok(response) => {
            if let Some(chunk) = response.choices.first() {
                if let Some(content) = &chunk.delta.content {
                    full_response.push_str(content);

                    let state = if is_first_message {
                        is_first_message = false;
                        "CREATED"
                    } else {
                        "IN_PROGRESS"
                    };

                    // Emit the message in the expected format
                    let msg = json!({
                        "role": "BOT",
                        "content": [{"text": {"value": content}}],
                        "state": state
                    });

                    println!("Emitting message: {}", msg.to_string());

                    window.emit("chatbot-message", msg.to_string())
                        .map_err(|e| e.to_string())?;
                }
            }
        },
        Err(e) => {
            let error_message = e.to_string();
            println!("Stream error: {}", error_message);

            let result = json!({
                "status": 500,
                "message": format!("stream failed: {}", error_message),
                "data": Option::<serde_json::Value>::None,
            });
            return Err(result.to_string());
        }
    }
}

// Emit COMPLETED event after stream finishes
if !full_response.is_empty() {
    let msg = json!({
        "role": "BOT",
        "content": [{"text": {"value": null}}],
        "state": "COMPLETED"
    });

    println!("Emitting completion message: {}", msg.to_string());

    window.emit("chatbot-message", msg.to_string())
        .map_err(|e| e.to_string())?;

    full_response = String::new();
}

    let result = json!({
        "status": 200,
        "message": "Success",
        "data": Option::<serde_json::Value>::None,
    });

    Ok(result.to_string())
}
