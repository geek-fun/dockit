use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

