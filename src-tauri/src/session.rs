//! Refresh-token session (geekfun#59 §2.2 / cloud-sync P0).
//!
//! The refresh token is an opaque 30-day bearer credential rotated on every
//! use. Storage lives with the frontend session (the persisted account
//! store); this module owns only the rotation protocol: present the current
//! lease + device identity, receive the successor pair, and classify
//! rejections so the frontend can drop dead leases.
//!
//! Rotations serialize through `SessionState::rotate_lock`: the lease is
//! single-use and the server treats presenting an already-rotated token as a
//! leak that revokes the device scope, so two concurrent rotations must
//! never race.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::common::console;
use crate::device_identity;

pub const SESSION_REJECTED_ERROR_TYPE: &str = "SESSION_REJECTED";

#[derive(Default)]
pub struct SessionState {
    /// See module docs — guards the present-then-replace window.
    pub rotate_lock: tokio::sync::Mutex<()>,
}

pub fn session_rejected_error(message: &str) -> String {
    json!({
        "error_type": SESSION_REJECTED_ERROR_TYPE,
        "message": message,
    })
    .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshedSession {
    #[serde(rename = "access_token")]
    pub access_token: String,
    #[serde(rename = "refresh_token")]
    pub refresh_token: String,
}

/// Exchange a lease for the successor pair. The caller must surface the
/// returned refresh token to the frontend (which persists it) before
/// rotating again.
///
/// A deliberate rejection (HTTP 401/403, or a success-status envelope whose
/// code differs from 2000) returns the structured `SESSION_REJECTED` error
/// so the frontend drops the dead lease; transient failures return plain
/// errors and the lease is kept.
pub async fn rotate_session(
    state: &SessionState,
    refresh_token: &str,
    device_payload: &device_identity::DevicePayload,
) -> Result<RefreshedSession, String> {
    let refresh_token = refresh_token.trim();
    if refresh_token.is_empty() {
        return Err("no stored refresh token".to_string());
    }

    let _guard = state.rotate_lock.lock().await;
    let response = console::client()
        .post(format!("{}/api/v1/auth/refresh", console::api_base_url()))
        .json(&json!({ "refresh_token": refresh_token, "device": device_payload }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let status = response.status();
    let raw: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("invalid refresh payload: {e}"))?;

    let code = raw.get("code").and_then(|v| v.as_u64()).unwrap_or(0);
    if is_server_rejected(status, code) {
        let message = raw
            .get("messages")
            .and_then(|m| m.get(0))
            .and_then(|m| m.as_str())
            .unwrap_or("session refresh rejected")
            .to_string();
        return Err(session_rejected_error(&message));
    }

    let data = raw.get("data").cloned().unwrap_or(json!({}));
    let session: RefreshedSession =
        serde_json::from_value(data).map_err(|e| format!("invalid refresh result: {e}"))?;
    Ok(session)
}

/// Deliberate server rejection (drop the lease) vs transient failure (keep
/// it): auth statuses always reject; a success-status envelope with a
/// non-success code rejects too; 5xx and unparsable bodies are transient.
fn is_server_rejected(status: reqwest::StatusCode, envelope_code: u64) -> bool {
    status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN
        || (status.is_success() && envelope_code != 2000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refreshed_session_deserializes_the_envelope_shape() {
        // the backend keeps access_token-style snake_case for token fields
        let raw = json!({
            "access_token": "jwt-value",
            "refresh_token": "opaque-lease",
        });
        let session: RefreshedSession = serde_json::from_value(raw).expect("session");
        assert_eq!(session.access_token, "jwt-value");
        assert_eq!(session.refresh_token, "opaque-lease");
    }

    #[test]
    fn rejection_error_is_structured() {
        let raw = session_rejected_error("lease expired");
        assert!(raw.contains(SESSION_REJECTED_ERROR_TYPE));
        assert!(raw.contains("lease expired"));
    }

    #[test]
    fn refresh_rejection_classification() {
        use reqwest::StatusCode;

        assert!(is_server_rejected(StatusCode::UNAUTHORIZED, 0));
        assert!(is_server_rejected(StatusCode::FORBIDDEN, 2000));
        assert!(is_server_rejected(StatusCode::OK, 4010));
        // 5xx is transient — the lease stays
        assert!(!is_server_rejected(StatusCode::INTERNAL_SERVER_ERROR, 2000));
        assert!(!is_server_rejected(StatusCode::BAD_GATEWAY, 5000));
        assert!(!is_server_rejected(StatusCode::OK, 2000));
    }
}
