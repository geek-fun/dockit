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
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub type ConfirmMap = Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>;
pub type CancelMap = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;

const MAX_ITERATIONS: usize = 20;
const CONTEXT_CHAR_THRESHOLD: usize = 64_000;
const CONFIRM_TIMEOUT_SECS: u64 = 300;
const RETRY_DELAYS_MS: &[u64] = &[1_000, 3_000, 8_000];
const RETRYABLE_ERROR_TYPES: &[&str] = &[
    "rate_limit_exceeded",
    "insufficient_quota",
    "service_unavailable",
    "overloaded_error",
];

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
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

fn update_session_status_inline(db: &AgentDb, session_id: &str, status: &str) -> Result<(), String> {
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

fn insert_tool_result(db: &AgentDb, tool_call_id: &str, full_result: &str) -> Result<String, String> {
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
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx_now = now_ms();
    for id in ids_to_remove {
        conn.execute(
            "DELETE FROM agent_messages WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![new_id(), session_id, "system", format!("[Summary] {}", summary), tx_now - 1_000_000],
    )
    .map_err(|e| e.to_string())?;
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
                let retryable = status.as_u16() == 429
                    || status.as_u16() == 503
                    || is_retryable(&err_type);
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
        tokio::time::sleep(Duration::from_millis(RETRY_DELAYS_MS[attempt])).await;
    }
    Err(last_err)
}

fn build_request_body(
    settings: &Value,
    history_msgs: &[Value],
    stream: bool,
) -> Value {
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

fn db_messages_to_chat(messages: &[(String, String, String)], system_prompt: Option<&str>) -> Vec<Value> {
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
    let _ = app.emit("agent-loop-summary-injected", json!({"session_id": session_id}));
    Ok(())
}

#[derive(Default)]
struct StreamAccumulator {
    content: String,
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
                tokio::time::sleep(Duration::from_millis(RETRY_DELAYS_MS[attempt])).await;
                continue;
            }
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            let err_type = classify_error(&text).unwrap_or_default();
            let retryable = status.as_u16() == 429
                || status.as_u16() == 503
                || is_retryable(&err_type);
            last_err = format!("LLM HTTP {}: {}", status, text);
            if !retryable || attempt >= RETRY_DELAYS_MS.len() {
                return Err(last_err);
            }
            tokio::time::sleep(Duration::from_millis(RETRY_DELAYS_MS[attempt])).await;
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
                        if let Some(tcs) = delta.get("tool_calls").and_then(|t| t.as_array()) {
                            for tc in tcs {
                                let idx = tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0)
                                    as usize;
                                while acc.tool_calls.len() <= idx {
                                    acc.tool_calls.push(AccTool::default());
                                }
                                let entry = &mut acc.tool_calls[idx];
                                if let Some(id) = tc.get("id").and_then(|x| x.as_str()) {
                                    entry.id = id.to_string();
                                }
                                if let Some(func) = tc.get("function") {
                                    if let Some(name) =
                                        func.get("name").and_then(|x| x.as_str())
                                    {
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

    let result = run_agent_loop_inner(
        &session_id,
        &user_message,
        &settings,
        &app,
        &db,
        &confirm_map,
        &cancel_map,
        executor.as_ref(),
    )
    .await;

    let _ = update_session_status_inline(&db, &session_id, "idle");

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
    cancel_map: &CancelMap,
    tool_executor: &dyn ToolExecutor,
) -> Result<(), String> {
    update_session_status_inline(db, session_id, "running")?;

    let user_id = new_id();
    insert_message(db, &user_id, session_id, "user", user_message)?;

    let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
    {
        let mut cm = cancel_map.lock().map_err(|e| e.to_string())?;
        cm.insert(session_id.to_string(), cancel_tx);
    }

    let connection_config = settings
        .get("connectionConfig")
        .cloned()
        .unwrap_or(Value::Null);
    let system_prompt = settings_get_str(settings, "systemPrompt").map(|s| s.to_string());

    let base_url = get_base_url(settings);
    let headers = build_headers(settings)?;
    let http_proxy = settings_get_str(settings, "httpProxy").map(|s| s.to_string());
    let http_client = create_http_client(http_proxy, None);

    for _iter in 0..MAX_ITERATIONS {
        match cancel_rx.try_recv() {
            Ok(_) | Err(oneshot::error::TryRecvError::Closed) => {
                return Err("cancelled".to_string());
            }
            Err(oneshot::error::TryRecvError::Empty) => {}
        }

        maybe_summarize_context(session_id, settings, app, db).await?;

        let history = load_messages(db, session_id)?;
        let chat_msgs = db_messages_to_chat(&history, system_prompt.as_deref());
        let body = build_request_body(settings, &chat_msgs, true);

        let acc = stream_chat(
            &http_client,
            &base_url,
            headers.clone(),
            body,
            session_id,
            app,
        )
        .await?;

        let assistant_message_id = new_id();

        if acc.tool_calls.is_empty() {
            insert_message(
                db,
                &assistant_message_id,
                session_id,
                "assistant",
                &acc.content,
            )?;
            let _ = app.emit(
                "agent-loop-step-done",
                json!({"session_id": session_id, "message_id": assistant_message_id}),
            );
            let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
            let mut cm = cancel_map.lock().map_err(|e| e.to_string())?;
            cm.remove(session_id);
            return Ok(());
        }

        let tool_calls_json: Vec<Value> = acc
            .tool_calls
            .iter()
            .map(|t| {
                json!({
                    "id": t.id,
                    "type": "function",
                    "function": {"name": t.name, "arguments": t.arguments}
                })
            })
            .collect();
        let assistant_payload = json!({
            "content": if acc.content.is_empty() { Value::Null } else { Value::String(acc.content.clone()) },
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

        for tc in &acc.tool_calls {
            let tool_call_id = if tc.id.is_empty() { new_id() } else { tc.id.clone() };
            let arguments_value: Value =
                serde_json::from_str(&tc.arguments).unwrap_or(Value::Null);

            insert_tool_call(
                db,
                &tool_call_id,
                &assistant_message_id,
                session_id,
                &tc.name,
                &tc.arguments,
                "pending",
            )?;

            let _ = app.emit(
                "agent-loop-tool-call",
                json!({
                    "session_id": session_id,
                    "tool_call_id": tool_call_id,
                    "tool_name": tc.name,
                    "arguments": arguments_value,
                }),
            );

            let (confirm_tx, confirm_rx) = oneshot::channel::<bool>();
            {
                let mut cm = confirm_map.lock().map_err(|e| e.to_string())?;
                cm.insert(tool_call_id.clone(), confirm_tx);
            }

            let allowed = match tokio::time::timeout(
                Duration::from_secs(CONFIRM_TIMEOUT_SECS),
                confirm_rx,
            )
            .await
            {
                Ok(Ok(v)) => v,
                Ok(Err(_)) => false,
                Err(_) => {
                    let mut cm = confirm_map.lock().map_err(|e| e.to_string())?;
                    cm.remove(&tool_call_id);
                    return Err(format!("tool confirmation timeout: {}", tool_call_id));
                }
            };

            if !allowed {
                update_tool_call_status(db, &tool_call_id, "denied")?;
                return Err(format!("tool call denied: {}", tool_call_id));
            }

            update_tool_call_status(db, &tool_call_id, "approved")?;

            let envelope: ToolEnvelope = match tool_executor
                .execute(&tc.name, &arguments_value, &connection_config)
                .await
            {
                Ok(env) => env,
                Err(e) => {
                    update_tool_call_status(db, &tool_call_id, "failed")?;
                    return Err(format!("tool execution failed: {}", e));
                }
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
                "name": tc.name,
                "content": envelope.summary,
            });
            insert_message(db, &new_id(), session_id, "tool", &tool_msg.to_string())?;
        }
    }

    let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
    let mut cm = cancel_map.lock().map_err(|e| e.to_string())?;
    cm.remove(session_id);
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
