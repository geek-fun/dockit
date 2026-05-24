use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;

use crate::agent::compact::{evaluate, resolve_model_spec_for_session, run_compact_with_events};
use crate::agent::loop_runner_support::{load_messages_for_compact, new_id, now_ms};
use crate::db::AgentDb;

/// Per-session async mutex registry. Ensures only one compaction runs per
/// session at a time, regardless of which append path triggered it.
static SESSION_COMPACT_LOCKS: OnceLock<Mutex<HashMap<String, Arc<AsyncMutex<()>>>>> =
    OnceLock::new();

fn lock_for(session_id: &str) -> Arc<AsyncMutex<()>> {
    let map_mu = SESSION_COMPACT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = map_mu.lock().expect("compact lock map poisoned");
    map.entry(session_id.to_string())
        .or_insert_with(|| Arc::new(AsyncMutex::new(())))
        .clone()
}

fn auto_compact_enabled(settings: &Value) -> bool {
    settings
        .get("autoCompact")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
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
    let _ = app.emit(
        "agent-context-usage",
        json!({
            "session_id": session_id,
            "used_tokens": decision.used_tokens,
            "capacity": decision.capacity,
            "context_window": spec.context_window,
            "output_reserve": spec.output_reserve,
            "trigger_at": decision.trigger_at,
            "should_compact": decision.should_compact,
            "model": spec.model_id,
        }),
    );
}

pub fn needs_compact(db: &AgentDb, session_id: &str, settings: &Value) -> bool {
    let Ok(messages) = load_messages_for_compact(db, session_id) else {
        return false;
    };
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

    if auto_compact_enabled(settings) && needs_compact(db, session_id, settings) {
        spawn_background_compact(db.clone(), app.clone(), settings.clone(), session_id.to_string());
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
                let _ = app.emit(
                    "agent-loop-summary-injected",
                    json!({
                        "session_id": session_id,
                        "trigger": info.trigger,
                        "pre_tokens": info.pre_tokens,
                        "post_tokens": info.post_tokens,
                        "removed_count": info.removed_count,
                        "fallback_keep_pairs": info.fallback_keep_pairs,
                    }),
                );
            }
            Ok(None) => {}
            Err(compact_err) => {
                let _ = app.emit(
                    "agent-loop-warning",
                    json!({
                        "session_id": session_id,
                        "warning": format!("Context compaction skipped: {}", compact_err),
                    }),
                );
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
        let lock = lock_for(&session_id);
        let _guard = lock.lock().await;

        if !needs_compact(&db, &session_id, &settings) {
            return;
        }

        match run_compact_with_events(&session_id, &settings, &db, &app).await {
            Ok(Some(info)) => {
                let _ = app.emit(
                    "agent-loop-summary-injected",
                    json!({
                        "session_id": session_id,
                        "trigger": info.trigger,
                        "pre_tokens": info.pre_tokens,
                        "post_tokens": info.post_tokens,
                        "removed_count": info.removed_count,
                        "fallback_keep_pairs": info.fallback_keep_pairs,
                    }),
                );
                emit_usage(&app, &session_id, &settings, &db);
            }
            Ok(None) => {}
            Err(compact_err) => {
                let _ = app.emit(
                    "agent-loop-warning",
                    json!({
                        "session_id": session_id,
                        "warning": format!("Background compaction skipped: {}", compact_err),
                    }),
                );
            }
        }
    });
}
