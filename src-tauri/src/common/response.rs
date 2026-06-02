use serde::Serialize;

/// Unified API response envelope used by all capability handlers and
/// direct Tauri commands.  Mirrors the `{ status, data, message }`
/// convention already shared by Elasticsearch and DynamoDB capability
/// response parsers on the frontend side.
///
/// # Status conventions
///
/// | Code | Meaning               |
/// |------|-----------------------|
/// | 200  | Success               |
/// | 400  | Bad input / validation|
/// | 404  | Not found             |
/// | 409  | Conflict              |
/// | 500  | Internal / driver err |
///
/// # Wire format
///
/// ```json
/// { "status": 200, "data": { ... }, "message": null }
/// { "status": 404, "data": null, "message": "No document matched" }
/// ```
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub status: u16,
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    /// Build a 200 success response.
    pub fn ok(data: T) -> Self {
        Self {
            status: 200,
            data: Some(data),
            message: None,
        }
    }

    /// Build a 200 success response with an informational message.
    pub fn ok_with_message(data: T, message: impl Into<String>) -> Self {
        Self {
            status: 200,
            data: Some(data),
            message: Some(message.into()),
        }
    }

    /// Build an error response with the given HTTP-style status code.
    pub fn err(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            data: None,
            message: Some(message.into()),
        }
    }
}

// Convenience constructors for `Value` payloads so callers don't need
// to spell out the generic parameter every time.

impl ApiResponse<serde_json::Value> {
    /// 200 success wrapping an arbitrary JSON value.
    pub fn json(data: serde_json::Value) -> Self {
        Self::ok(data)
    }

    /// Serialise `Self` to a JSON string (with truncation) suitable for
    /// returning from a capability handler.
    pub fn into_string(self) -> String {
        crate::common::format::truncate_tool_output(serde_json::to_string(&self).unwrap())
    }
}
