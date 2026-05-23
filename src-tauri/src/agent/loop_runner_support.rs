use std::time::Duration;

use rand::Rng;
use serde_json::Value;

use crate::db::AgentDb;

const RETRY_DELAYS_MS: &[u64] = &[1_000, 3_000, 8_000];
const RETRY_JITTER_MS: u64 = 250;
const RETRYABLE_ERROR_TYPES: &[&str] = &[
    "rate_limit_exceeded",
    "insufficient_quota",
    "service_unavailable",
    "overloaded_error",
];

#[derive(Debug, Clone)]
pub struct StoredMessage {
    pub id: String,
    pub role: String,
    pub content: String,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn load_messages_for_compact(
    db: &AgentDb,
    session_id: &str,
) -> Result<Vec<StoredMessage>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content FROM agent_messages \
             WHERE session_id = ?1 \
               AND created_at >= COALESCE(\
                 (SELECT created_at FROM agent_messages \
                  WHERE session_id = ?1 AND role = 'system' AND content LIKE '%_compact_boundary%' \
                  ORDER BY created_at DESC LIMIT 1), 0) \
             ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok(StoredMessage {
                id: row.get::<_, String>(0)?,
                role: row.get::<_, String>(1)?,
                content: row.get::<_, String>(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn replace_messages_with_summary(
    db: &AgentDb,
    session_id: &str,
    ids_to_remove: &[String],
    summary_payload: &str,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let boundary_ts: i64 = if ids_to_remove.is_empty() {
        now_ms()
    } else {
        let placeholders = std::iter::repeat("?")
            .take(ids_to_remove.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT MIN(created_at) FROM agent_messages WHERE session_id = ? AND id IN ({})",
            placeholders
        );
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(1 + ids_to_remove.len());
        params.push(&session_id);
        for id in ids_to_remove {
            params.push(id);
        }
        tx.query_row(&sql, rusqlite::params_from_iter(params.iter().copied()), |row| {
            row.get::<_, Option<i64>>(0)
        })
        .map_err(|e| format!("Failed to read earliest removed timestamp: {}", e))?
        .unwrap_or_else(now_ms)
    };

    // Boundary row must sort before any kept message, so back-date by 1ms.
    // load_messages uses created_at >= boundary_ts as the cutoff.
    let boundary_created_at = boundary_ts.saturating_sub(1);

    tx.execute(
        "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![new_id(), session_id, "system", summary_payload, boundary_created_at],
    )
    .map_err(|e| e.to_string())?;

    if !ids_to_remove.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(ids_to_remove.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "DELETE FROM agent_messages WHERE session_id = ? AND id IN ({})",
            placeholders
        );
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(1 + ids_to_remove.len());
        params.push(&session_id);
        for id in ids_to_remove {
            params.push(id);
        }
        tx.execute(&sql, rusqlite::params_from_iter(params.iter().copied()))
            .map_err(|e| format!("Failed to delete compacted messages: {}", e))?;

        // Cascade-delete any orphaned tool_calls + tool_result_store rows
        // whose parent assistant message was just removed, to keep the DB
        // free of zombie references that could confuse later replays.
        let tc_sql = format!(
            "DELETE FROM agent_tool_calls WHERE session_id = ? AND message_id IN ({})",
            placeholders
        );
        let mut tc_params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(1 + ids_to_remove.len());
        tc_params.push(&session_id);
        for id in ids_to_remove {
            tc_params.push(id);
        }
        let _ = tx.execute(&tc_sql, rusqlite::params_from_iter(tc_params.iter().copied()));
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn classify_error(body: &str) -> Option<String> {
    let v: Value = serde_json::from_str(body).ok()?;
    v.get("error")
        .and_then(|e| e.get("type"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

fn is_retryable(err_type: &str) -> bool {
    RETRYABLE_ERROR_TYPES.iter().any(|t| *t == err_type)
}

async fn jittered_sleep_ms(base_ms: u64) {
    let jitter = rand::thread_rng().gen_range(-(RETRY_JITTER_MS as i64)..=RETRY_JITTER_MS as i64);
    let delay = (base_ms as i64 + jitter).max(0) as u64;
    tokio::time::sleep(Duration::from_millis(delay)).await;
}

pub async fn post_chat_completions_compact(
    http_client: &reqwest::Client,
    base_url: &str,
    headers: reqwest::header::HeaderMap,
    body: Value,
) -> Result<reqwest::Response, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut last_err = String::from("LLM request failed");
    for attempt in 0..=RETRY_DELAYS_MS.len() {
        let resp = http_client
            .post(&url)
            .headers(headers.clone())
            .json(&body)
            .send()
            .await;
        match resp {
            Ok(r) => {
                if r.status().is_success() {
                    return Ok(r);
                }
                let status = r.status();
                let text = r.text().await.unwrap_or_default();
                let err_type = classify_error(&text).unwrap_or_default();
                let retryable =
                    status.as_u16() == 429 || status.as_u16() == 503 || is_retryable(&err_type);
                last_err = format!("LLM HTTP {}: {}", status, text);
                if !retryable || attempt >= RETRY_DELAYS_MS.len() {
                    return Err(last_err);
                }
            }
            Err(e) => {
                last_err = format!("LLM request error: {}", e);
                if attempt >= RETRY_DELAYS_MS.len() {
                    return Err(last_err);
                }
            }
        }
        jittered_sleep_ms(RETRY_DELAYS_MS[attempt]).await;
    }
    Err(last_err)
}
