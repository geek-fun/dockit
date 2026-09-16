//! Entitlement & version-lock resolution (geekfun#56 contract).
//!
//! The server owns all judgement semantics; the client only reads two
//! server-computed fields from `GET /api/v1/subscriptions`:
//! `ultimateExpiresAt` (active benefit, covers trials) and
//! `versionLockHorizon` (monotonic high-water mark of paid periods,
//! trials excluded). Local Ultimate features unlock while
//! `ultimateActive || versionLocked`; cloud services require
//! `ultimateActive` regardless of the version lock.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::common::console;

/// Release date of the running app version (UTC, `YYYY-MM-DD`). The release
/// workflow stamps the build date via the `APP_RELEASE_DATE` env var; the
/// fallback only covers local/dev builds — bump it on release. A version
/// stays unlocked forever when `APP_RELEASE_DATE <= versionLockHorizon`.
pub const APP_RELEASE_DATE: &str = match option_env!("APP_RELEASE_DATE") {
    Some(date) => date,
    None => "2026-09-11",
};

/// Minimum interval between two network refreshes (contract rule 2).
pub const REFRESH_MIN_INTERVAL_MS: i64 = 5 * 60 * 1000;

pub const ENTITLEMENT_ERROR_TYPE: &str = "ENTITLEMENT_REQUIRED";

enum SubscriptionsError {
    /// 401 — the access token expired; a session refresh may recover.
    Unauthorized,
    Other(String),
}

/// Days since 1970-01-01 for a civil UTC date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Parse an RFC3339 timestamp (`Z` or `±HH:MM` offset, optional fractional
/// seconds) into unix milliseconds.
pub fn parse_rfc3339_ms(value: &str) -> Option<i64> {
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() < 19 || bytes[4] != b'-' || bytes[7] != b'-' {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut rest = value.get(19..)?;
    let mut millis = 0i64;
    if rest.starts_with('.') {
        let frac_end = rest[1..]
            .find(|c: char| !c.is_ascii_digit())
            .map(|i| i + 1)
            .unwrap_or(rest.len());
        let digits = &rest[1..frac_end];
        if digits.is_empty() {
            return None;
        }
        let scaled = format!("{:0<3}", &digits[..digits.len().min(3)]);
        millis = scaled.parse().ok()?;
        rest = &rest[frac_end..];
    }

    let offset_ms = match rest {
        "" | "Z" | "z" => 0,
        _ => {
            let sign = match rest.as_bytes()[0] {
                b'+' => 1,
                b'-' => -1,
                _ => return None,
            };
            let offset = &rest[1..];
            if offset.len() != 5 || offset.as_bytes()[2] != b':' {
                return None;
            }
            let oh: i64 = offset.get(0..2)?.parse().ok()?;
            let om: i64 = offset.get(3..5)?.parse().ok()?;
            sign * (oh * 3600 + om * 60) * 1000
        }
    };

    Some(
        (days_from_civil(year, month, day) * 86_400 + hour * 3600 + minute * 60 + second) * 1000
            + millis
            - offset_ms,
    )
}

/// Parse a `YYYY-MM-DD` UTC date into unix milliseconds (start of day).
pub fn parse_date_utc_ms(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    if trimmed.len() != 10 {
        return parse_rfc3339_ms(trimmed);
    }
    let year: i64 = trimmed.get(0..4)?.parse().ok()?;
    let month: i64 = trimmed.get(5..7)?.parse().ok()?;
    let day: i64 = trimmed.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some(days_from_civil(year, month, day) * 86_400 * 1000)
}

pub fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubscriptionCache {
    pub fetched_at_ms: i64,
    #[serde(rename = "ultimateExpiresAt")]
    pub ultimate_expires_at: Option<String>,
    #[serde(rename = "versionLockHorizon")]
    pub version_lock_horizon: Option<String>,
    #[serde(rename = "cancelScheduledAt")]
    pub cancel_scheduled_at: Option<String>,
}

/// Pure entitlement decision — no transport or caching semantics.
pub struct EntitlementDecision {
    /// Active benefit (paid period or trial) — gates cloud services and,
    /// while active, local features too.
    pub ultimate_active: bool,
    /// This app release falls under the version lock — permanent offline
    /// access to local Ultimate features.
    pub version_locked: bool,
    /// `ultimateActive || versionLocked` — the gate for local features.
    pub local_ultimate: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementView {
    /// Active benefit (paid period or trial) — gates cloud services and,
    /// while active, local features too.
    pub ultimate_active: bool,
    /// This app release falls under the version lock — permanent offline
    /// access to local Ultimate features.
    pub version_locked: bool,
    /// `ultimateActive || versionLocked` — the gate for local features.
    pub local_ultimate: bool,
    pub app_release_date: &'static str,
    pub ultimate_expires_at: Option<String>,
    pub version_lock_horizon: Option<String>,
    pub cancel_scheduled_at: Option<String>,
    /// True when the view was derived from the cached last success instead
    /// of a fresh network response (offline / degraded / throttled).
    pub cached: bool,
    pub fetched_at_ms: Option<i64>,
    pub last_error: Option<String>,
}

/// Pure entitlement decision. Fail-closed: an unparseable release date or
/// missing horizon locks the release out of version-locked features.
pub fn compute_entitlement(cache: Option<&SubscriptionCache>, now_ms: i64) -> EntitlementDecision {
    let release_ms = parse_date_utc_ms(APP_RELEASE_DATE);
    let ultimate_active = cache
        .and_then(|c| c.ultimate_expires_at.as_deref())
        .and_then(parse_rfc3339_ms)
        .is_some_and(|expires_at| expires_at > now_ms);
    let version_locked = match (release_ms, cache) {
        (Some(release_ms), Some(cache)) => cache
            .version_lock_horizon
            .as_deref()
            .and_then(parse_rfc3339_ms)
            .is_some_and(|horizon| release_ms <= horizon),
        _ => false,
    };
    EntitlementDecision {
        ultimate_active,
        version_locked,
        local_ultimate: ultimate_active || version_locked,
    }
}

pub struct EntitlementState {
    cache: Mutex<Option<SubscriptionCache>>,
    last_success_ms: Mutex<i64>,
    cache_path: Mutex<Option<PathBuf>>,
}

impl EntitlementState {
    pub fn load(cache_path: Option<PathBuf>) -> Self {
        let cache = cache_path.as_ref().and_then(|path| {
            std::fs::read_to_string(path)
                .ok()
                .and_then(|raw| serde_json::from_str::<SubscriptionCache>(&raw).ok())
        });
        EntitlementState {
            cache: Mutex::new(cache),
            last_success_ms: Mutex::new(0),
            cache_path: Mutex::new(cache_path),
        }
    }

    fn set_cache(&self, cache: SubscriptionCache) {
        if let Ok(raw) = serde_json::to_string(&cache) {
            if let Ok(path) = self.cache_path.lock() {
                if let Some(path) = path.as_ref() {
                    let _ = std::fs::write(path, raw);
                }
            }
        }
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = Some(cache);
        *self
            .last_success_ms
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = now_unix_ms();
    }

    pub fn view(&self, cached: bool, last_error: Option<String>) -> EntitlementView {
        let binding = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let decision = compute_entitlement(binding.as_ref(), now_unix_ms());
        EntitlementView {
            ultimate_active: decision.ultimate_active,
            version_locked: decision.version_locked,
            local_ultimate: decision.local_ultimate,
            app_release_date: APP_RELEASE_DATE,
            ultimate_expires_at: binding.as_ref().and_then(|c| c.ultimate_expires_at.clone()),
            version_lock_horizon: binding
                .as_ref()
                .and_then(|c| c.version_lock_horizon.clone()),
            cancel_scheduled_at: binding.as_ref().and_then(|c| c.cancel_scheduled_at.clone()),
            cached,
            fetched_at_ms: binding.as_ref().map(|c| c.fetched_at_ms),
            last_error,
        }
    }

    pub fn local_entitled(&self) -> bool {
        self.view(true, None).local_ultimate
    }

    /// Wipe the cached entitlement (logout): memory + persisted cache file.
    pub fn clear(&self) {
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *self
            .last_success_ms
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = 0;
        if let Ok(path) = self.cache_path.lock() {
            if let Some(path) = path.as_ref() {
                let _ = std::fs::remove_file(path);
            }
        }
    }

    fn last_success_ms(&self) -> i64 {
        *self
            .last_success_ms
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    fn refresh_throttled(&self) -> bool {
        now_unix_ms() - self.last_success_ms() < REFRESH_MIN_INTERVAL_MS
    }
}

pub fn entitlement_required_error(feature: &str) -> String {
    json!({
        "status": 403,
        "error_type": ENTITLEMENT_ERROR_TYPE,
        "message": format!("'{feature}' requires an Ultimate subscription"),
    })
    .to_string()
}

/// Rust-side gate for local Ultimate features. Commands return the
/// `ENTITLEMENT_REQUIRED` error and the frontend only guides.
pub fn ensure_local_ultimate(state: &EntitlementState, feature: &str) -> Result<(), String> {
    if state.local_entitled() {
        Ok(())
    } else {
        Err(entitlement_required_error(feature))
    }
}

async fn fetch_subscriptions(token: &str) -> Result<SubscriptionCache, SubscriptionsError> {
    let url = format!("{}/api/v1/subscriptions", console::api_base_url());
    let response = console::client()
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| SubscriptionsError::Other(format!("network error: {e}")))?;
    let status = response.status();
    if !status.is_success() {
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(SubscriptionsError::Unauthorized);
        }
        return Err(SubscriptionsError::Other(format!(
            "subscriptions endpoint returned HTTP {status}"
        )));
    }
    let payload: serde_json::Value = response
        .json()
        .await
        .map_err(|e| SubscriptionsError::Other(format!("invalid subscriptions payload: {e}")))?;
    let field = |name: &str| {
        payload
            .get(name)
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };
    Ok(SubscriptionCache {
        fetched_at_ms: now_unix_ms(),
        ultimate_expires_at: field("ultimateExpiresAt"),
        version_lock_horizon: field("versionLockHorizon"),
        cancel_scheduled_at: payload
            .get("subscription")
            .and_then(|s| s.get("cancelScheduledAt"))
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .map(str::to_string),
    })
}

/// Refresh entitlements from the server. Network/5xx failures degrade to the
/// cached view (contract rule 5); a 401 triggers one transparent session
/// refresh (rotating the stored lease) before giving up — only then does the
/// cached view carry the error.
#[tauri::command]
pub async fn refresh_entitlement(
    token: String,
    refresh_token: Option<String>,
    force: bool,
    state: State<'_, EntitlementState>,
    session_state: State<'_, crate::session::SessionState>,
    identity: State<'_, crate::device_activation::DeviceIdentityState>,
    app: AppHandle,
) -> Result<EntitlementView, String> {
    if token.trim().is_empty() {
        return Ok(state.view(true, Some("not logged in".to_string())));
    }
    if !force && state.refresh_throttled() {
        return Ok(state.view(true, None));
    }
    match fetch_subscriptions(token.trim()).await {
        Ok(cache) => {
            state.set_cache(cache);
            Ok(state.view(false, None))
        }
        Err(SubscriptionsError::Unauthorized) => {
            let lease = refresh_token.as_deref().unwrap_or("").trim();
            if lease.is_empty() {
                return Ok(state.view(true, Some("session expired".to_string())));
            }
            match crate::session::rotate_session(&session_state, lease, &identity.payload()).await {
                Ok(refreshed) => {
                    let _ = app.emit(
                        "session-refreshed",
                        json!({
                            "accessToken": refreshed.access_token,
                            "refreshToken": refreshed.refresh_token,
                        }),
                    );
                    match fetch_subscriptions(&refreshed.access_token).await {
                        Ok(cache) => {
                            state.set_cache(cache);
                            Ok(state.view(false, None))
                        }
                        Err(_) => Ok(state.view(true, Some("session refresh failed".to_string()))),
                    }
                }
                Err(err) => {
                    if err.contains(crate::session::SESSION_REJECTED_ERROR_TYPE) {
                        Err(err)
                    } else {
                        Ok(state.view(true, Some(err)))
                    }
                }
            }
        }
        Err(SubscriptionsError::Other(err)) => Ok(state.view(true, Some(err))),
    }
}

#[tauri::command]
pub fn get_entitlement(state: State<'_, EntitlementState>) -> EntitlementView {
    state.view(true, None)
}

/// Called on logout — entitlements are account-scoped, so the cached state
/// must not outlive the session (a different account on the same machine
/// must not inherit the previous account's version lock).
#[tauri::command]
pub fn clear_entitlement(state: State<'_, EntitlementState>) -> EntitlementView {
    state.clear();
    state.view(true, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_760_000_000_000; // 2025-10-09T06:13:20Z

    fn cache(ultimate: Option<&str>, horizon: Option<&str>) -> Option<SubscriptionCache> {
        Some(SubscriptionCache {
            fetched_at_ms: NOW,
            ultimate_expires_at: ultimate.map(str::to_string),
            version_lock_horizon: horizon.map(str::to_string),
            cancel_scheduled_at: None,
        })
    }

    #[test]
    fn parse_rfc3339_handles_utc_millis_and_offsets() {
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_rfc3339_ms("2026-10-09T00:00:00.000Z"),
            Some(1_791_504_000_000)
        );
        assert_eq!(
            parse_rfc3339_ms("2026-10-09T00:00:00Z"),
            parse_rfc3339_ms("2026-10-09T08:00:00+08:00")
        );
        assert_eq!(
            parse_rfc3339_ms("2026-10-09T00:00:00.5Z"),
            Some(1_791_504_000_500)
        );
        assert_eq!(parse_rfc3339_ms("not-a-date"), None);
        assert_eq!(parse_rfc3339_ms("2026-13-09T00:00:00Z"), None);
    }

    #[test]
    fn trial_is_active_but_never_version_locked() {
        let decision =
            compute_entitlement(cache(Some("2026-10-09T00:00:00.000Z"), None).as_ref(), NOW);
        assert!(decision.ultimate_active);
        assert!(!decision.version_locked);
        assert!(decision.local_ultimate);
    }

    #[test]
    fn expired_trial_without_horizon_falls_back_to_free() {
        let decision =
            compute_entitlement(cache(Some("2020-01-01T00:00:00.000Z"), None).as_ref(), NOW);
        assert!(!decision.ultimate_active);
        assert!(!decision.version_locked);
        assert!(!decision.local_ultimate);
    }

    #[test]
    fn expired_subscription_stays_version_locked_for_older_releases() {
        let decision = compute_entitlement(
            cache(
                Some("2020-01-01T00:00:00.000Z"),
                Some("2027-01-01T00:00:00.000Z"),
            )
            .as_ref(),
            NOW,
        );
        assert!(!decision.ultimate_active);
        assert!(decision.version_locked);
        assert!(decision.local_ultimate);
    }

    #[test]
    fn releases_after_the_horizon_need_renewal() {
        let decision =
            compute_entitlement(cache(None, Some("2020-01-01T00:00:00.000Z")).as_ref(), NOW);
        assert!(decision.version_locked == (parse_date_utc_ms(APP_RELEASE_DATE).unwrap() <= 0));
        let fresh =
            compute_entitlement(cache(None, Some("2999-01-01T00:00:00.000Z")).as_ref(), NOW);
        assert!(fresh.version_locked);
        assert!(fresh.local_ultimate);
    }

    #[test]
    fn no_cache_means_community_mode() {
        let decision = compute_entitlement(None, NOW);
        assert!(!decision.ultimate_active);
        assert!(!decision.version_locked);
        assert!(!decision.local_ultimate);
    }

    #[test]
    fn entitlement_error_is_structured() {
        let raw = entitlement_required_error("AI");
        assert!(raw.contains(ENTITLEMENT_ERROR_TYPE));
        assert!(raw.contains("AI"));
    }
}
