//! Device activation (geekfun#59): registers this machine against the
//! account's device ledger at the entitlement-activation point and surfaces
//! the 5030 "limit reached" payload for the replace flow.
//!
//! The command returns `Ok(ActivatedResult)` on success and a structured
//! JSON error string with `error_type: DEVICE_LIMIT_REACHED` when the server
//! answers 5030 — the frontend renders the replace picker from the attached
//! device list. Other failures degrade to plain error strings (never
//! silently swallowed by the caller).

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

use crate::common::console;
use crate::device_identity;
use crate::session::{self, SessionState};

pub const DEVICE_LIMIT_ERROR_TYPE: &str = "DEVICE_LIMIT_REACHED";

pub struct DeviceIdentityState {
    app_data_dir: PathBuf,
}

impl DeviceIdentityState {
    pub fn load(app_data_dir: PathBuf) -> Self {
        DeviceIdentityState { app_data_dir }
    }

    pub fn payload(&self) -> device_identity::DevicePayload {
        device_identity::build_payload(&self.app_data_dir)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub platform: String,
    #[serde(default)]
    pub activated_at: Option<String>,
    #[serde(default)]
    pub last_seen_at: Option<String>,
    #[serde(default)]
    pub is_current: bool,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceLimitInfo {
    pub limit: u32,
    pub used: u32,
    #[serde(default)]
    pub devices: Vec<DeviceDto>,
    #[serde(default)]
    pub manage_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivatedResult {
    pub device_id: String,
    pub limit: u32,
    pub used: u32,
    /// Device-bound 30-day lease — persisted into the session store.
    /// The backend keeps `access_token`-style snake_case for token fields.
    #[serde(rename = "refresh_token", default)]
    pub refresh_token: Option<String>,
}

fn device_limit_error(info: &DeviceLimitInfo) -> String {
    json!({
        "error_type": DEVICE_LIMIT_ERROR_TYPE,
        "code": 5030,
        "limit_reached": info,
    })
    .to_string()
}

/// Parse the `{code, messages, data}` envelope; `Ok(None)` means the body
/// could not be interpreted as an envelope at all.
fn parse_envelope(payload: serde_json::Value) -> Option<(u32, Vec<String>, serde_json::Value)> {
    let code = payload.get("code").and_then(|v| v.as_u64())? as u32;
    let messages = payload
        .get("messages")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    Some((
        code,
        messages,
        payload.get("data").cloned().unwrap_or_default(),
    ))
}

/// Outcome of a single activation HTTP attempt.
enum ActivateAttempt {
    Ok(ActivatedResult),
    LimitReached(DeviceLimitInfo),
    /// 401 — the access token is stale; a session refresh may recover.
    Unauthorized,
    Failed(String),
}

/// Request body for one activation attempt — pure so the replace flow stays
/// testable without HTTP.
fn activation_body(
    payload: &device_identity::DevicePayload,
    replace_device_id: Option<&str>,
) -> serde_json::Value {
    let mut body = json!({ "device": payload });
    if let Some(replace) = replace_device_id {
        body["replaceDeviceId"] = json!(replace);
    }
    body
}

async fn post_activate(
    token: &str,
    payload: &device_identity::DevicePayload,
    replace_device_id: Option<&str>,
) -> ActivateAttempt {
    let url = format!("{}/api/v1/devices/activate", console::api_base_url());

    let response = match console::client()
        .post(url)
        .bearer_auth(token)
        .json(&activation_body(payload, replace_device_id))
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => return ActivateAttempt::Failed(format!("network error: {e}")),
    };

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return ActivateAttempt::Unauthorized;
    }

    let raw: serde_json::Value = match response.json().await {
        Ok(raw) => raw,
        Err(e) => return ActivateAttempt::Failed(format!("invalid activation payload: {e}")),
    };

    let Some((code, messages, data)) = parse_envelope(raw) else {
        return ActivateAttempt::Failed("activation endpoint returned an invalid envelope".into());
    };

    if code == 2000 {
        return match serde_json::from_value::<ActivatedResult>(data) {
            Ok(parsed) => ActivateAttempt::Ok(parsed),
            Err(e) => ActivateAttempt::Failed(format!("invalid activation result: {e}")),
        };
    }
    if code == 5030 {
        return match serde_json::from_value::<DeviceLimitInfo>(data) {
            Ok(info) => ActivateAttempt::LimitReached(info),
            Err(e) => ActivateAttempt::Failed(format!("invalid 5030 payload: {e}")),
        };
    }
    ActivateAttempt::Failed(
        messages
            .first()
            .cloned()
            .unwrap_or_else(|| format!("activation failed (code {code})")),
    )
}

/// Activate this device for the account. Idempotent on the server — safe to
/// call at every entitlement-activation point. A stale access token (401)
/// is transparently recovered via the frontend-supplied refresh lease (the
/// successor pair is broadcast so the persisted session stays in sync).
#[tauri::command]
pub async fn activate_device(
    token: String,
    refresh_token: Option<String>,
    replace_device_id: Option<String>,
    state: State<'_, DeviceIdentityState>,
    session_state: State<'_, SessionState>,
    app: AppHandle,
) -> Result<ActivatedResult, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("not logged in".to_string());
    }
    let payload = state.payload();

    let mut attempt = post_activate(&token, &payload, replace_device_id.as_deref()).await;
    if let ActivateAttempt::Unauthorized = attempt {
        let lease = refresh_token.as_deref().unwrap_or("").trim();
        if !lease.is_empty() {
            if let Ok(refreshed) = session::rotate_session(&session_state, lease, &payload).await {
                let _ = app.emit(
                    "session-refreshed",
                    json!({
                        "accessToken": refreshed.access_token,
                        "refreshToken": refreshed.refresh_token,
                    }),
                );
                attempt = post_activate(
                    &refreshed.access_token,
                    &payload,
                    replace_device_id.as_deref(),
                )
                .await;
            }
        }
    }

    match attempt {
        // The device-bound lease rides back to the frontend, which persists
        // it alongside the rest of the account session.
        ActivateAttempt::Ok(result) => Ok(result),
        ActivateAttempt::LimitReached(info) => Err(device_limit_error(&info)),
        ActivateAttempt::Unauthorized => Err("session expired — please sign in again".to_string()),
        ActivateAttempt::Failed(message) => Err(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_parsing_handles_code_messages_data() {
        let raw = json!({
            "code": 2000,
            "messages": ["操作成功"],
            "data": { "deviceId": "dev_1", "limit": 3, "used": 1 },
        });
        let (code, messages, data) = parse_envelope(raw).expect("envelope");
        assert_eq!(code, 2000);
        assert_eq!(messages, vec!["操作成功".to_string()]);
        assert_eq!(data["deviceId"], "dev_1");
    }

    #[test]
    fn limit_reached_error_carries_the_device_list() {
        let info = DeviceLimitInfo {
            limit: 3,
            used: 3,
            devices: vec![DeviceDto {
                id: "dev_1".to_string(),
                name: "Old Mac".to_string(),
                platform: "macos".to_string(),
                activated_at: None,
                last_seen_at: None,
                is_current: false,
                status: "active".to_string(),
            }],
            manage_url: Some("https://console/home/devices".to_string()),
        };
        let raw = device_limit_error(&info);
        assert!(raw.contains(DEVICE_LIMIT_ERROR_TYPE));
        assert!(raw.contains("Old Mac"));
    }

    #[test]
    fn device_dto_deserializes_camel_case_dates() {
        let raw = serde_json::json!({
            "id": "dev_1",
            "name": "MacBook Pro",
            "platform": "macos",
            "activatedAt": "2026-09-01T00:00:00.000Z",
            "lastSeenAt": null,
            "isCurrent": true,
            "status": "active",
        });
        let dto: DeviceDto = serde_json::from_value(raw).expect("dto");
        assert!(dto.is_current);
        assert_eq!(
            dto.activated_at.as_deref(),
            Some("2026-09-01T00:00:00.000Z")
        );
        assert!(dto.last_seen_at.is_none());
    }

    #[test]
    fn activated_result_carries_the_optional_refresh_lease() {
        let raw = json!({
            "deviceId": "dev_9",
            "limit": 3,
            "used": 3,
            "refresh_token": "opaque-lease",
        });
        let result: ActivatedResult = serde_json::from_value(raw).expect("result");
        assert_eq!(result.refresh_token.as_deref(), Some("opaque-lease"));

        // tolerate responses without the lease (older backends)
        let bare: ActivatedResult =
            serde_json::from_value(json!({ "deviceId": "d", "limit": 3, "used": 1 }))
                .expect("bare");
        assert!(bare.refresh_token.is_none());
    }

    #[test]
    fn activation_bodies_carry_the_device_and_optional_replace_target() {
        let identity = device_identity::RawIdentity {
            primary: Some("PLATFORM".to_string()),
            secondary: vec![],
            is_virtual: false,
        };
        let composed = device_identity::compose_payload(&identity, "install", "n", "linux");

        let without_replace = activation_body(&composed, None);
        assert!(without_replace.get("replaceDeviceId").is_none());
        assert_eq!(without_replace["device"]["platform"], "linux");

        let with_replace = activation_body(&composed, Some("dev_9"));
        assert_eq!(with_replace["replaceDeviceId"], "dev_9");
    }
}
