use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use crate::agent::config::{build_headers, get_base_url};
use crate::agent::executor::ToolEnvelope;
use crate::agent::tool_executor::ToolExecutor;
use crate::agent::tools::{alias_from_prefixed_name, openai_name_to_internal};
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub type ConfirmMap = Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>;
pub type CancelMap = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;

const MAX_ITERATIONS: usize = 20;
const CONTEXT_CHAR_THRESHOLD: usize = 64_000;
const CONFIRM_TIMEOUT_SECS: u64 = 300;
const RETRY_DELAYS_MS: &[u64] = &[1_000, 3_000, 8_000];
const RETRY_JITTER_MS: u64 = 250;
const RETRYABLE_ERROR_TYPES: &[&str] = &[
    "rate_limit_exceeded",
    "insufficient_quota",
    "service_unavailable",
    "overloaded_error",
];

use rand::Rng;

async fn jittered_sleep_ms(base_ms: u64) {
    let jitter = rand::thread_rng().gen_range(-(RETRY_JITTER_MS as i64)..=RETRY_JITTER_MS as i64);
    let delay = (base_ms as i64 + jitter).max(0) as u64;
    tokio::time::sleep(Duration::from_millis(delay)).await;
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

struct ConfirmGuard {
    confirm_map: ConfirmMap,
    tool_call_id: String,
}

impl ConfirmGuard {
    fn new(confirm_map: ConfirmMap, tool_call_id: String) -> Self {
        Self {
            confirm_map,
            tool_call_id,
        }
    }
}

impl Drop for ConfirmGuard {
    fn drop(&mut self) {
        if let Ok(mut cm) = self.confirm_map.lock() {
            cm.remove(&self.tool_call_id);
        }
    }
}

fn settings_get_str<'a>(settings: &'a Value, key: &str) -> Option<&'a str> {
    settings.get(key).and_then(|v| v.as_str())
}

fn insert_message(
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

fn update_session_status_inline(
    db: &AgentDb,
    session_id: &str,
    status: &str,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE agent_sessions SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![status, now_ms(), session_id],
    )
    .map_err(|e| format!("Failed to update session status: {}", e))?;
    Ok(())
}

fn load_messages(db: &AgentDb, session_id: &str) -> Result<Vec<(String, String, String)>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content FROM agent_messages WHERE session_id = ?1 ORDER BY created_at ASC, id ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

fn insert_tool_call(
    db: &AgentDb,
    id: &str,
    message_id: &str,
    session_id: &str,
    tool_name: &str,
    arguments: &str,
    status: &str,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO agent_tool_calls (id, message_id, session_id, tool_name, arguments, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![id, message_id, session_id, tool_name, arguments, status, now_ms()],
    )
    .map_err(|e| format!("Failed to insert tool_call: {}", e))?;
    Ok(())
}

fn update_tool_call_status(db: &AgentDb, id: &str, status: &str) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE agent_tool_calls SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn insert_tool_result(
    db: &AgentDb,
    tool_call_id: &str,
    full_result: &str,
) -> Result<String, String> {
    let id = new_id();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tool_result_store (id, tool_call_id, full_result, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, tool_call_id, full_result, now_ms()],
    )
    .map_err(|e| format!("Failed to insert tool_result: {}", e))?;
    Ok(id)
}

fn replace_messages_with_summary(
    db: &AgentDb,
    session_id: &str,
    ids_to_remove: &[String],
    summary: &str,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx_now = now_ms();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in ids_to_remove {
        tx.execute(
            "DELETE FROM agent_messages WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![new_id(), session_id, "system", format!("[Summary] {}", summary), tx_now - 1_000_000],
    )
    .map_err(|e| e.to_string())?;
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

async fn post_chat_completions(
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

fn build_request_body(settings: &Value, history_msgs: &[Value], stream: bool) -> Value {
    let model = settings_get_str(settings, "model").unwrap_or("gpt-4o-mini");
    let mut body = json!({
        "model": model,
        "messages": history_msgs,
        "stream": stream,
    });
    if let Some(tools) = settings.get("tools") {
        if tools.is_array() && !tools.as_array().map(|a| a.is_empty()).unwrap_or(true) {
            body["tools"] = tools.clone();
        }
    }
    body
}

fn db_messages_to_chat(
    messages: &[(String, String, String)],
    system_prompt: Option<&str>,
) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    if let Some(sys) = system_prompt {
        if !sys.trim().is_empty() {
            out.push(json!({"role": "system", "content": sys}));
        }
    }
    for (_id, role, content) in messages {
        if role == "tool" {
            if let Ok(v) = serde_json::from_str::<Value>(content) {
                let tool_call_id = v.get("tool_call_id").and_then(|x| x.as_str()).unwrap_or("");
                let inner = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                out.push(json!({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": inner,
                }));
            }
        } else if role == "assistant" {
            if let Ok(v) = serde_json::from_str::<Value>(content) {
                if v.is_object() && (v.get("tool_calls").is_some() || v.get("content").is_some()) {
                    let mut msg = json!({"role": "assistant"});
                    if let Some(c) = v.get("content") {
                        msg["content"] = c.clone();
                    } else {
                        msg["content"] = Value::Null;
                    }
                    if let Some(tc) = v.get("tool_calls") {
                        msg["tool_calls"] = tc.clone();
                    }
                    out.push(msg);
                    continue;
                }
            }
            out.push(json!({"role": "assistant", "content": content}));
        } else {
            out.push(json!({"role": role, "content": content}));
        }
    }
    out
}

fn total_chars(messages: &[(String, String, String)]) -> usize {
    messages.iter().map(|(_, _, c)| c.chars().count()).sum()
}

async fn maybe_summarize_context(
    session_id: &str,
    settings: &Value,
    app: &AppHandle,
    db: &AgentDb,
) -> Result<(), String> {
    let messages = load_messages(db, session_id)?;
    if total_chars(&messages) < CONTEXT_CHAR_THRESHOLD {
        return Ok(());
    }
    let keep_last = 4usize;
    if messages.len() <= keep_last {
        return Ok(());
    }
    let split = (messages.len() - keep_last) / 2;
    if split == 0 {
        return Ok(());
    }
    let to_summarize = &messages[..split];
    let ids_to_remove: Vec<String> = to_summarize.iter().map(|(id, _, _)| id.clone()).collect();

    let chat_msgs = db_messages_to_chat(to_summarize, None);
    let summarize_prompt = json!([
        {"role": "system", "content": "Summarize the following conversation concisely, preserving key facts, tool results, decisions, and unresolved tasks. Output a plain text summary."},
        {"role": "user", "content": serde_json::to_string(&chat_msgs).unwrap_or_default()}
    ]);

    let base_url = get_base_url(settings);
    let headers = build_headers(settings)?;
    let http_proxy = settings_get_str(settings, "httpProxy").map(|s| s.to_string());
    let http_client = create_http_client(http_proxy, None);

    let body = json!({
        "model": settings_get_str(settings, "model").unwrap_or("gpt-4o-mini"),
        "messages": summarize_prompt,
        "stream": false,
    });

    let resp = post_chat_completions(&http_client, &base_url, headers, body).await?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let summary = payload
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    if summary.is_empty() {
        return Ok(());
    }

    replace_messages_with_summary(db, session_id, &ids_to_remove, &summary)?;
    let _ = app.emit(
        "agent-loop-summary-injected",
        json!({"session_id": session_id}),
    );
    Ok(())
}

#[derive(Default)]
struct StreamAccumulator {
    content: String,
    thinking: String,
    tool_calls: Vec<AccTool>,
    finish_reason: String,
}

#[derive(Default, Clone)]
struct AccTool {
    id: String,
    name: String,
    arguments: String,
}

async fn stream_chat(
    http_client: &reqwest::Client,
    base_url: &str,
    headers: reqwest::header::HeaderMap,
    body: Value,
    session_id: &str,
    app: &AppHandle,
) -> Result<StreamAccumulator, String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut last_err = String::from("Stream failed");

    for attempt in 0..=RETRY_DELAYS_MS.len() {
        let resp = http_client
            .post(&url)
            .headers(headers.clone())
            .json(&body)
            .send()
            .await;
        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("LLM request error: {}", e);
                if attempt >= RETRY_DELAYS_MS.len() {
                    return Err(last_err);
                }
                jittered_sleep_ms(RETRY_DELAYS_MS[attempt]).await;
                continue;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            let err_type = classify_error(&text).unwrap_or_default();
            let retryable =
                status.as_u16() == 429 || status.as_u16() == 503 || is_retryable(&err_type);
            last_err = format!("LLM HTTP {}: {}", status, text);
            if !retryable || attempt >= RETRY_DELAYS_MS.len() {
                return Err(last_err);
            }
            jittered_sleep_ms(RETRY_DELAYS_MS[attempt]).await;
            continue;
        }

        let mut acc = StreamAccumulator::default();
        let mut buf = String::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Stream chunk error: {}", e))?;
            let s = String::from_utf8_lossy(&bytes);
            buf.push_str(&s);

            while let Some(pos) = buf.find("\n\n") {
                let event_block = buf[..pos].to_string();
                buf.drain(..pos + 2);

                for line in event_block.lines() {
                    let line = line.trim();
                    if !line.starts_with("data:") {
                        continue;
                    }
                    let data = line[5..].trim();
                    if data == "[DONE]" {
                        return Ok(acc);
                    }
                    let v: Value = match serde_json::from_str(data) {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let choice = match v.get("choices").and_then(|c| c.get(0)) {
                        Some(c) => c,
                        None => continue,
                    };
                    if let Some(delta) = choice.get("delta") {
                        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                            if !content.is_empty() {
                                acc.content.push_str(content);
                                let _ = app.emit(
                                    "agent-loop-delta",
                                    json!({
                                        "session_id": session_id,
                                        "content": content,
                                    }),
                                );
                            }
                        }
                        let thinking_chunk = delta
                            .get("reasoning_content")
                            .or_else(|| delta.get("thinking"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if !thinking_chunk.is_empty() {
                            acc.thinking.push_str(thinking_chunk);
                            let _ = app.emit(
                                "agent-loop-thinking-delta",
                                json!({
                                    "session_id": session_id,
                                    "content": thinking_chunk,
                                }),
                            );
                        }
                        if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                            for tc in tcs {
                                let idx =
                                    tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                                while acc.tool_calls.len() <= idx {
                                    acc.tool_calls.push(AccTool::default());
                                }
                                let entry = &mut acc.tool_calls[idx];
                                if let Some(id) = tc.get("id").and_then(|x| x.as_str()) {
                                    entry.id = id.to_string();
                                }
                                if let Some(func) = tc.get("function") {
                                    if let Some(name) = func.get("name").and_then(|x| x.as_str()) {
                                        if !name.is_empty() {
                                            entry.name = name.to_string();
                                        }
                                    }
                                    if let Some(args) =
                                        func.get("arguments").and_then(|x| x.as_str())
                                    {
                                        entry.arguments.push_str(args);
                                    }
                                }
                            }
                        }
                    }
                    if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
                        acc.finish_reason = reason.to_string();
                    }
                }
            }
        }
        return Ok(acc);
    }

    Err(last_err)
}

#[tauri::command]
pub async fn run_agent_loop(
    session_id: String,
    user_message: String,
    settings: Value,
    app: AppHandle,
) -> Result<(), String> {
    let db_state: State<AgentDb> = app.state::<AgentDb>();
    let db: AgentDb = AgentDb(db_state.0.clone());
    let confirm_state: State<ConfirmMap> = app.state::<ConfirmMap>();
    let confirm_map: ConfirmMap = confirm_state.inner().clone();
    let cancel_state: State<CancelMap> = app.state::<CancelMap>();
    let cancel_map: CancelMap = cancel_state.inner().clone();
    let executor_state: State<Arc<dyn ToolExecutor>> = app.state::<Arc<dyn ToolExecutor>>();
    let executor: Arc<dyn ToolExecutor> = executor_state.inner().clone();

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    {
        let mut cm = cancel_map.lock().map_err(|e| e.to_string())?;
        if cm.contains_key(&session_id) {
            return Err(format!("session already running: {}", session_id));
        }
        cm.insert(session_id.clone(), cancel_tx);
    }

    let result = run_agent_loop_inner(
        &session_id,
        &user_message,
        &settings,
        &app,
        &db,
        &confirm_map,
        cancel_rx,
        executor.as_ref(),
    )
    .await;

    let _ = update_session_status_inline(&db, &session_id, "idle");

    {
        if let Ok(mut cm) = cancel_map.lock() {
            cm.remove(&session_id);
        }
    }

    if let Err(ref e) = result {
        let _ = app.emit(
            "agent-loop-error",
            json!({"session_id": session_id, "error": e}),
        );
    }
    result
}

async fn run_agent_loop_inner(
    session_id: &str,
    user_message: &str,
    settings: &Value,
    app: &AppHandle,
    db: &AgentDb,
    confirm_map: &ConfirmMap,
    mut cancel_rx: oneshot::Receiver<()>,
    tool_executor: &dyn ToolExecutor,
) -> Result<(), String> {
    update_session_status_inline(db, session_id, "running")?;

    let user_id = new_id();
    insert_message(db, &user_id, session_id, "user", user_message)?;

    let connections: HashMap<String, Value> = settings
        .get("connections")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let fallback_connection_config = settings
        .get("connectionConfig")
        .cloned()
        .unwrap_or(Value::Null);
    let system_prompt = settings_get_str(settings, "systemPrompt").map(|s| s.to_string());

    let base_url = get_base_url(settings);
    let headers = build_headers(settings)?;
    let http_proxy = settings_get_str(settings, "httpProxy").map(|s| s.to_string());
    let http_client = create_http_client(http_proxy, None);

    let allowed_tools: std::collections::HashSet<String> = settings
        .get("tools")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    t.get("function")
                        .and_then(|f| f.get("name"))
                        .and_then(|n| n.as_str())
                })
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    for _iter in 0..MAX_ITERATIONS {
        if let Err(summary_err) = maybe_summarize_context(session_id, settings, app, db).await {
            let _ = app.emit(
                "agent-loop-warning",
                json!({"session_id": session_id, "warning": format!("Context summarization skipped: {}", summary_err)}),
            );
        }

        let history = load_messages(db, session_id)?;
        let chat_msgs = db_messages_to_chat(&history, system_prompt.as_deref());
        let body = build_request_body(settings, &chat_msgs, true);

        let acc = tokio::select! {
            biased;
            _ = &mut cancel_rx => {
                return Err("cancelled".to_string());
            }
            res = stream_chat(
                &http_client,
                &base_url,
                headers.clone(),
                body,
                session_id,
                app,
            ) => res?,
        };

        let assistant_message_id = new_id();

        if acc.tool_calls.is_empty() {
            let payload = if acc.thinking.is_empty() {
                acc.content.clone()
            } else {
                json!({
                    "content": acc.content,
                    "thinking": acc.thinking,
                })
                .to_string()
            };
            insert_message(db, &assistant_message_id, session_id, "assistant", &payload)?;
            let _ = app.emit(
                "agent-loop-step-done",
                json!({"session_id": session_id, "message_id": assistant_message_id}),
            );
            let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
            return Ok(());
        }

        let resolved_tool_ids: Vec<String> = acc
            .tool_calls
            .iter()
            .map(|t| {
                if t.id.is_empty() {
                    new_id()
                } else {
                    t.id.clone()
                }
            })
            .collect();

        let tool_calls_json: Vec<Value> = acc
            .tool_calls
            .iter()
            .zip(resolved_tool_ids.iter())
            .map(|(t, resolved_id)| {
                json!({
                    "id": resolved_id,
                    "type": "function",
                    "function": {"name": t.name, "arguments": t.arguments}
                })
            })
            .collect();
        let assistant_payload = json!({
            "content": if acc.content.is_empty() { Value::Null } else { Value::String(acc.content.clone()) },
            "thinking": if acc.thinking.is_empty() { Value::Null } else { Value::String(acc.thinking.clone()) },
            "tool_calls": tool_calls_json,
        });
        insert_message(
            db,
            &assistant_message_id,
            session_id,
            "assistant",
            &assistant_payload.to_string(),
        )?;
        let _ = app.emit(
            "agent-loop-step-done",
            json!({"session_id": session_id, "message_id": assistant_message_id}),
        );

        for (tc, tool_call_id) in acc.tool_calls.iter().zip(resolved_tool_ids.iter()) {
            let tool_call_id = tool_call_id.clone();
            let tool_name = openai_name_to_internal(&tc.name);
            let arguments_value: Value = match serde_json::from_str(&tc.arguments) {
                Ok(v) => v,
                Err(e) => {
                    insert_tool_call(
                        db,
                        &tool_call_id,
                        &assistant_message_id,
                        session_id,
                        &tool_name,
                        &tc.arguments,
                        "failed",
                    )?;
                    let err_msg = json!({
                        "tool_call_id": tool_call_id,
                        "name": tool_name,
                        "content": format!("Invalid JSON arguments from LLM: {}", e),
                    });
                    insert_message(db, &new_id(), session_id, "tool", &err_msg.to_string())?;
                    continue;
                }
            };

            insert_tool_call(
                db,
                &tool_call_id,
                &assistant_message_id,
                session_id,
                &tool_name,
                &tc.arguments,
                "pending",
            )?;

            if allowed_tools.is_empty() || !allowed_tools.contains(&tc.name) {
                update_tool_call_status(db, &tool_call_id, "failed")?;
                let deny_msg = json!({
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": format!("Tool '{}' is not allowed in this session.", tool_name),
                });
                insert_message(db, &new_id(), session_id, "tool", &deny_msg.to_string())?;
                continue;
            }

            let _ = app.emit(
                "agent-loop-tool-call",
                json!({
                    "session_id": session_id,
                    "tool_call_id": tool_call_id,
                    "tool_name": tool_name,
                    "arguments": arguments_value,
                }),
            );

            let (confirm_tx, confirm_rx) = oneshot::channel::<bool>();
            {
                let mut cm = confirm_map.lock().map_err(|e| e.to_string())?;
                cm.insert(tool_call_id.clone(), confirm_tx);
            }
            let _guard = ConfirmGuard::new(confirm_map.clone(), tool_call_id.clone());

            let confirm_future =
                tokio::time::timeout(Duration::from_secs(CONFIRM_TIMEOUT_SECS), confirm_rx);

            let allowed = tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    return Err("cancelled".to_string());
                }
                res = confirm_future => match res {
                    Ok(Ok(v)) => v,
                    Ok(Err(_)) => false,
                    Err(_) => {
                        return Err(format!("tool confirmation timeout: {}", tool_call_id));
                    }
                },
            };

            if !allowed {
                update_tool_call_status(db, &tool_call_id, "denied")?;
                let tool_deny_msg = json!({
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": format!("Tool call '{}' was denied by the user. Try an alternative approach.", tool_name),
                });
                insert_message(
                    db,
                    &new_id(),
                    session_id,
                    "tool",
                    &tool_deny_msg.to_string(),
                )?;
                continue;
            }

            update_tool_call_status(db, &tool_call_id, "approved")?;

            let resolved_config = match alias_from_prefixed_name(&tc.name) {
                Some(alias) => match connections.get(&alias) {
                    Some(cfg) => cfg.clone(),
                    None => {
                        update_tool_call_status(db, &tool_call_id, "failed")?;
                        let err_msg = json!({
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": format!("Unknown source alias '{}' for tool '{}'.", alias, tool_name),
                        });
                        insert_message(db, &new_id(), session_id, "tool", &err_msg.to_string())?;
                        continue;
                    }
                },
                None => fallback_connection_config.clone(),
            };

            let envelope: ToolEnvelope = tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    update_tool_call_status(db, &tool_call_id, "failed")?;
                    let cancel_msg = json!({
                        "tool_call_id": tool_call_id,
                        "name": tool_name,
                        "content": format!("Tool '{}' was cancelled before completion. Partial execution may have occurred.", tool_name),
                    });
                    insert_message(db, &new_id(), session_id, "tool", &cancel_msg.to_string())?;
                    return Err("cancelled".to_string());
                }
                res = tool_executor.execute(&tool_name, &arguments_value, &resolved_config) => match res {
                    Ok(env) => env,
                    Err(e) => {
                        update_tool_call_status(db, &tool_call_id, "failed")?;
                        let error_msg = json!({
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": format!("Tool execution error: {}", e),
                        });
                        insert_message(db, &new_id(), session_id, "tool", &error_msg.to_string())?;
                        continue;
                    }
                },
            };

            insert_tool_result(db, &tool_call_id, &envelope.full_result)?;
            update_tool_call_status(db, &tool_call_id, "completed")?;

            let _ = app.emit(
                "agent-loop-tool-result",
                json!({
                    "session_id": session_id,
                    "tool_call_id": tool_call_id,
                    "envelope": envelope,
                }),
            );

            let tool_msg = json!({
                "tool_call_id": tool_call_id,
                "name": tool_name,
                "content": envelope.summary,
            });
            insert_message(db, &new_id(), session_id, "tool", &tool_msg.to_string())?;
        }
    }

    let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
    Ok(())
}

#[tauri::command]
pub async fn cancel_agent_loop(
    session_id: String,
    cancel_map: State<'_, CancelMap>,
) -> Result<(), String> {
    let tx_opt = {
        let mut cm = cancel_map.lock().map_err(|e| e.to_string())?;
        cm.remove(&session_id)
    };
    if let Some(tx) = tx_opt {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn confirm_tool_call(
    tool_call_id: String,
    allowed: bool,
    confirm_map: State<'_, ConfirmMap>,
) -> Result<(), String> {
    let tx_opt = {
        let mut cm = confirm_map.lock().map_err(|e| e.to_string())?;
        cm.remove(&tool_call_id)
    };
    if let Some(tx) = tx_opt {
        let _ = tx.send(allowed);
        Ok(())
    } else {
        Err(format!("no pending confirmation for {}", tool_call_id))
    }
}

#[tauri::command]
pub async fn get_tool_full_result(
    tool_call_id: String,
    db: State<'_, AgentDb>,
) -> Result<String, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT full_result FROM tool_result_store WHERE tool_call_id = ?1 ORDER BY created_at DESC LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        let result: Result<String, rusqlite::Error> =
            stmt.query_row(rusqlite::params![tool_call_id], |row| row.get(0));
        result.map_err(|e| format!("Tool result not found: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}
