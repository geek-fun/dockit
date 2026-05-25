use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;

use crate::agent::compact::{count_projected_tokens, evaluate, resolve_model_spec_for_session, run_compact_with_events};
use crate::agent::loop_runner_support::{load_messages_for_compact, new_id, now_ms, StoredMessage};
use crate::db::AgentDb;

/// Per-session async mutex registry. Ensures only one compaction runs per
/// session at a time, regardless of which append path triggered it.
static SESSION_COMPACT_LOCKS: OnceLock<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>> =
    OnceLock::new();

/// Sessions that already have a background compaction queued or running.
/// Used by `append()` to avoid stacking N redundant background tasks while
/// one is already in flight — the mutex would serialize them anyway, but
/// every queued task would re-acquire the lock, re-check `needs_compact`,
/// and (when the summary alone is large) emit another boundary row.
static SESSION_COMPACT_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn inflight_set() -> &'static Mutex<HashSet<String>> {
    SESSION_COMPACT_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn try_acquire_inflight(session_id: &str) -> bool {
    let mut set = inflight_set().lock().expect("compact inflight set poisoned");
    set.insert(session_id.to_string())
}

fn release_inflight(session_id: &str) {
    let mut set = inflight_set().lock().expect("compact inflight set poisoned");
    set.remove(session_id);
}

pub fn lock_for(session_id: &str) -> Arc<AsyncMutex<()>> {
    let map_mu = SESSION_COMPACT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = map_mu.lock().expect("compact lock map poisoned");
    map.entry(session_id.to_string())
        .or_insert_with(|| Arc::new(AsyncMutex::new(())))
        .clone()
}

struct InflightGuard {
    session_id: String,
}

impl InflightGuard {
    fn new(session_id: String) -> Self {
        InflightGuard { session_id }
    }
}

impl Drop for InflightGuard {
    fn drop(&mut self) {
        release_inflight(&self.session_id);
    }
}

fn auto_compact_enabled(settings: &Value) -> bool {
    settings
        .get("autoCompact")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn is_tool_heavy_compaction_warning(message: &str) -> bool {
    message.starts_with("Context compaction failed: history has too many consecutive tool calls")
}

fn write_message(
    db: &AgentDb,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, session_id, role, content, now_ms()],
    )
    .map_err(|e| format!("Failed to insert message: {}", e))?;
    conn.execute(
        "UPDATE agent_sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now_ms(), session_id],
    )
    .map_err(|e| format!("Failed to update session: {}", e))?;
    Ok(())
}

fn emit_usage(app: &AppHandle, session_id: &str, settings: &Value, db: &AgentDb) {
    let messages = match load_messages_for_compact(db, session_id) {
        Ok(m) => m,
        Err(_) => return,
    };
    let spec = resolve_model_spec_for_session(session_id, settings);
    let decision = evaluate(&messages, &spec);
    let system_prompt = settings.get("systemPrompt").and_then(|v| v.as_str());
    let tools = settings.get("tools");
    let used_tokens = count_projected_tokens(&messages, system_prompt, tools, &spec);
    let should_compact = used_tokens >= decision.trigger_at;
    let _ = app.emit(
        "agent-context-usage",
        json!({
            "session_id": session_id,
            "used_tokens": used_tokens,
            "capacity": decision.capacity,
            "context_window": spec.context_window,
            "output_reserve": spec.output_reserve,
            "trigger_at": decision.trigger_at,
            "should_compact": should_compact,
            "model": spec.model_id,
        }),
    );
}

fn is_compact_boundary(msg: &StoredMessage) -> bool {
    if msg.role != "system" {
        return false;
    }
    serde_json::from_str::<Value>(&msg.content)
        .ok()
        .and_then(|v| v.get("_compact_boundary").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

fn has_compactable_content_since_boundary(messages: &[StoredMessage]) -> bool {
    let last_boundary_idx = messages.iter().rposition(is_compact_boundary);
    let start = last_boundary_idx.map(|i| i + 1).unwrap_or(0);
    messages[start..]
        .iter()
        .any(|m| matches!(m.role.as_str(), "user" | "assistant" | "tool"))
}

pub fn needs_compact(db: &AgentDb, session_id: &str, settings: &Value) -> bool {
    let Ok(messages) = load_messages_for_compact(db, session_id) else {
        return false;
    };
    if !has_compactable_content_since_boundary(&messages) {
        return false;
    }
    let spec = resolve_model_spec_for_session(session_id, settings);
    evaluate(&messages, &spec).should_compact
}

/// Inline append: write the message synchronously, emit the usage snapshot,
/// and if the context now exceeds threshold AND autoCompact is on, spawn a
/// background compaction task. Returns immediately; does NOT wait for the LLM
/// summarize call. Callers that need the next LLM payload to be post-compacted
/// must call `prepare_for_llm` before building the request body.
pub fn append(
    db: &AgentDb,
    app: &AppHandle,
    settings: &Value,
    session_id: &str,
    id: &str,
    role: &str,
    content: &str,
) -> Result<(), String> {
    write_message(db, id, session_id, role, content)?;
    emit_usage(app, session_id, settings, db);

    // Do not trigger background compaction immediately after an assistant message that
    // contains tool_calls: the tool results have not been written yet, so compaction
    // would see a dangling assistant+tool_calls with no following tool messages and
    // produce a payload that OpenAI rejects with HTTP 400. The prepare_for_llm gate
    // runs before every LLM call and is the correct place to compact.
    let has_pending_tool_calls = role == "assistant"
        && serde_json::from_str::<serde_json::Value>(content)
            .ok()
            .and_then(|v| v.get("tool_calls").and_then(|tc| tc.as_array()).map(|a| !a.is_empty()))
            .unwrap_or(false);
    if !has_pending_tool_calls && auto_compact_enabled(settings) {
        if try_acquire_inflight(session_id) {
            spawn_background_compact(db.clone(), app.clone(), settings.clone(), session_id.to_string());
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub fn append_with_new_id(
    db: &AgentDb,
    app: &AppHandle,
    settings: &Value,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<String, String> {
    let id = new_id();
    append(db, app, settings, session_id, &id, role, content)?;
    Ok(id)
}

/// Blocking gate called by the loop right before sending a request to the LLM.
/// If a background compaction is in flight (or queued via the mutex), this
/// awaits it so the next LLM payload reflects the post-compact state. Then
/// runs one final compaction synchronously if `should_compact` is still true
/// (e.g., because the background spawn hasn't started yet, or fresh appends
/// landed during it). When compaction runs, compact.rs emits
/// `agent-loop-compacting` phase start/end around the summarize LLM call.
pub async fn prepare_for_llm(
    db: &AgentDb,
    app: &AppHandle,
    settings: &Value,
    session_id: &str,
) -> Result<(), String> {
    if !auto_compact_enabled(settings) {
        emit_usage(app, session_id, settings, db);
        return Ok(());
    }

    let lock = lock_for(session_id);
    let _guard = lock.lock().await;

    if needs_compact(db, session_id, settings) {
        match run_compact_with_events(session_id, settings, db, app).await {
            Ok(Some(info)) => {
                let mut summary_payload = json!({
                    "session_id": session_id,
                    "trigger": info.trigger,
                    "pre_tokens": info.pre_tokens,
                    "post_tokens": info.post_tokens,
                    "removed_count": info.removed_count,
                });
                if let Some(fallback_keep_pairs) = info.fallback_keep_pairs {
                    summary_payload["fallback_keep_pairs"] = json!(fallback_keep_pairs);
                }
                let _ = app.emit(
                    "agent-loop-summary-injected",
                    summary_payload,
                );
            }
            Ok(None) => {}
            Err(compact_err) => {
                if !is_tool_heavy_compaction_warning(&compact_err) {
                    let _ = app.emit(
                        "agent-loop-warning",
                        json!({
                            "session_id": session_id,
                            "warning": compact_err,
                        }),
                    );
                }
            }
        }
    }
    emit_usage(app, session_id, settings, db);
    Ok(())
}

/// Fire-and-forget background compaction. Acquires the per-session mutex so
/// it serializes with `prepare_for_llm`. Errors are swallowed (emitted as
/// warnings) because the caller already returned. Progress for long summarize
/// calls is emitted via `agent-loop-compacting` start/end from compact.rs.
fn spawn_background_compact(db: AgentDb, app: AppHandle, settings: Value, session_id: String) {
    tokio::spawn(async move {
        let _inflight = InflightGuard::new(session_id.clone());
        let lock = lock_for(&session_id);
        let _guard = lock.lock().await;

        let should_run = needs_compact(&db, &session_id, &settings);
        if !should_run {
            return;
        }

        let result = run_compact_with_events(&session_id, &settings, &db, &app).await;

        match result {
            Ok(Some(info)) => {
                let mut summary_payload = json!({
                    "session_id": session_id,
                    "trigger": info.trigger,
                    "pre_tokens": info.pre_tokens,
                    "post_tokens": info.post_tokens,
                    "removed_count": info.removed_count,
                });
                if let Some(fallback_keep_pairs) = info.fallback_keep_pairs {
                    summary_payload["fallback_keep_pairs"] = json!(fallback_keep_pairs);
                }
                let _ = app.emit(
                    "agent-loop-summary-injected",
                    summary_payload,
                );
                emit_usage(&app, &session_id, &settings, &db);
            }
            Ok(None) => {}
            Err(compact_err) => {
                if !is_tool_heavy_compaction_warning(&compact_err) {
                    let _ = app.emit(
                        "agent-loop-warning",
                        json!({
                            "session_id": session_id,
                            "warning": compact_err,
                        }),
                    );
                }
            }
        }
    });
}
