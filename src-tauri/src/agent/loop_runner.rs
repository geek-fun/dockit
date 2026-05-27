use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, LlmToolCall, OpenAIChatFormatter};
use crate::agent::compact::{count_projected_tokens, evaluate, resolve_model_spec_for_session};
use crate::agent::config::{build_headers, get_base_url};
use crate::agent::executor::ToolEnvelope;
use crate::agent::loop_runner_support::{load_messages_for_compact, StoredMessage};
use crate::agent::tool_executor::ToolExecutor;
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub type ConfirmMap = Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>;
pub type CancelMap = Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>;

const DEFAULT_MAX_ITERATIONS: usize = 200;
const DEFAULT_WALL_CLOCK_BUDGET_SECS: u64 = 30 * 60;
const DEFAULT_TOKEN_BUDGET: usize = 20_000_000;
const CONFIRM_TIMEOUT_SECS: u64 = 300;
const RETRY_DELAYS_MS: &[u64] = &[1_000, 3_000, 8_000];
const RETRY_JITTER_MS: u64 = 250;
const RETRYABLE_ERROR_TYPES: &[&str] = &[
    "rate_limit_exceeded",
    "service_unavailable",
    "overloaded_error",
];
const FATAL_ERROR_TYPES: &[&str] = &[
    "insufficient_quota",
    "invalid_request_error",
    "authentication_error",
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
    app: &AppHandle,
    settings: &Value,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<(), String> {
    crate::agent::conversation::append(db, app, settings, session_id, id, role, content)
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

fn load_active_history(db: &AgentDb, session_id: &str) -> Result<Vec<(String, String, String)>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content FROM agent_messages \
             WHERE session_id = ?1 \
               AND created_at >= COALESCE(\
                 (SELECT created_at FROM agent_messages \
                  WHERE session_id = ?1 AND role = 'system' AND content LIKE '%_compact_boundary%' \
                  ORDER BY created_at DESC LIMIT 1), 0) \
             ORDER BY created_at ASC, \
               CASE WHEN role = 'system' AND content LIKE '%_compact_boundary%' THEN 0 ELSE 1 END, \
               id ASC",
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

fn is_fatal(err_type: &str) -> bool {
    FATAL_ERROR_TYPES.iter().any(|t| *t == err_type)
}

// Projection layer: stored DB rows -> LLM ModelMessage[].
// DB is the full audit log (UIMessage equivalent); this function filters
// and reshapes rows into a payload the LLM API will accept. Mirrors the
// role of Vercel AI SDK's `convertToModelMessages` and OpenCode's
// `toModelMessagesEffect`. All "what does the LLM see?" logic belongs here.
fn build_llm_messages(
    messages: &[(String, String, String)],
    system_prompt: Option<&str>,
) -> Vec<LlmMessage> {
    let mut out: Vec<LlmMessage> = Vec::new();
    if let Some(sys) = system_prompt {
        if !sys.trim().is_empty() {
            out.push(LlmMessage {
                role: "system".into(),
                text_content: sys.to_string(),
                tool_calls: None,
                tool_call_id: None,
                thinking: None,
            });
        }
    }
    // Track tool_call_ids announced by the most recent assistant message.
    // Providers reject role="tool" messages whose tool_call_id was not declared
    // by an immediately-preceding assistant.tool_calls entry. Drop orphans
    // to survive any compaction-boundary edge case.
    let mut pending_tool_call_ids: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    for (_id, role, content) in messages {
        // Persisted LLM HTTP errors live in the DB as assistant rows so users
        // see them in chat history, but they are NOT valid model turns and
        // sending them back to the LLM corrupts the request. Skip them here.
        if role == "assistant" && content.starts_with("LLM HTTP ") {
            continue;
        }
        if role == "tool" {
            if let Ok(v) = serde_json::from_str::<Value>(content) {
                let tool_call_id = v.get("tool_call_id").and_then(|x| x.as_str()).unwrap_or("");
                let inner = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                if tool_call_id.is_empty() || !pending_tool_call_ids.remove(tool_call_id) {
                    continue;
                }
                out.push(LlmMessage {
                    role: "tool".into(),
                    text_content: inner.to_string(),
                    tool_calls: None,
                    tool_call_id: Some(tool_call_id.to_string()),
                    thinking: None,
                });
            }
        } else if role == "assistant" {
            if !pending_tool_call_ids.is_empty() {
                if out.last().map(|m| m.role.as_str()) == Some("assistant") {
                    out.pop();
                }
            }
            pending_tool_call_ids.clear();
            if let Ok(v) = serde_json::from_str::<Value>(content) {
                if v.is_object() && (v.get("tool_calls").is_some() || v.get("content").is_some()) {
                    let text_content = v
                        .get("content")
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string();
                    let tool_calls = v.get("tool_calls").and_then(|tc| {
                        tc.as_array().map(|arr| {
                            arr.iter()
                                .map(|call| {
                                    let id = call
                                        .get("id")
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let name = call
                                        .get("function")
                                        .and_then(|f| f.get("name"))
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let args = call
                                        .get("function")
                                        .and_then(|f| f.get("arguments"))
                                        .and_then(|x| x.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    if !id.is_empty() {
                                        pending_tool_call_ids.insert(id.clone());
                                    }
                                    LlmToolCall {
                                        id,
                                        name,
                                        arguments: args,
                                    }
                                })
                                .collect()
                        })
                    });
                    let thinking = v
                        .get("thinking")
                        .and_then(|t| t.as_str())
                        .map(|s| s.to_string());
                    out.push(LlmMessage {
                        role: "assistant".into(),
                        text_content,
                        tool_calls,
                        tool_call_id: None,
                        thinking,
                    });
                    continue;
                }
            }
            out.push(LlmMessage {
                role: "assistant".into(),
                text_content: content.clone(),
                tool_calls: None,
                tool_call_id: None,
                thinking: None,
            });
        } else {
            // Reaching a non-assistant/non-tool row (user or system) means
            // any still-pending tool_calls will never be answered. Drop the
            // orphan assistant so the provider doesn't reject the request.
            if !pending_tool_call_ids.is_empty() {
                if out.last().map(|m| m.role.as_str()) == Some("assistant") {
                    out.pop();
                }
            }
            pending_tool_call_ids.clear();
            if role == "system" {
                if let Ok(v) = serde_json::from_str::<Value>(content) {
                    if v.get("_compact_boundary")
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false)
                    {
                        let summary =
                            v.get("summary").and_then(|x| x.as_str()).unwrap_or_default();
                        out.push(LlmMessage {
                            role: "system".into(),
                            text_content: summary.to_string(),
                            tool_calls: None,
                            tool_call_id: None,
                            thinking: None,
                        });
                        continue;
                    }
                }
            }
            out.push(LlmMessage {
                role: role.clone(),
                text_content: content.clone(),
                tool_calls: None,
                tool_call_id: None,
                thinking: None,
            });
        }
    }
    if !pending_tool_call_ids.is_empty() {
        if out.last().map(|m| m.role.as_str()) == Some("assistant") {
            out.pop();
        }
    }
    out
}

/// Convert LlmMessage list to OpenAI-format JSON values for token counting.
fn llm_messages_to_values(messages: &[LlmMessage]) -> Vec<Value> {
    messages
        .iter()
        .map(|msg| match msg.role.as_str() {
            "tool" => json!({
                "role": "tool",
                "tool_call_id": msg.tool_call_id,
                "content": msg.text_content
            }),
            "assistant" => {
                let mut m = json!({"role": "assistant", "content": msg.text_content});
                if let Some(ref thinking) = msg.thinking {
                    if !thinking.is_empty() {
                        m["reasoning_content"] = Value::String(thinking.clone());
                    }
                }
                if let Some(ref calls) = msg.tool_calls {
                    let tc: Vec<Value> = calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments
                                }
                            })
                        })
                        .collect();
                    m["tool_calls"] = Value::Array(tc);
                }
                m
            }
            _ => json!({"role": msg.role, "content": msg.text_content}),
        })
        .collect()
}

/// Public wrapper that projects stored messages the same way as
/// build_llm_messages. Used by count_projected_tokens for accurate
/// token estimation that matches what the LLM actually receives.
pub fn project_messages(
    messages: &[StoredMessage],
    system_prompt: Option<&str>,
) -> Vec<Value> {
    let tuples: Vec<(String, String, String)> = messages
        .iter()
        .map(|m| (m.id.clone(), m.role.clone(), m.content.clone()))
        .collect();
    let llm_msgs = build_llm_messages(&tuples, system_prompt);
    llm_messages_to_values(&llm_msgs)
}

fn emit_loop_stopped(app: &AppHandle, session_id: &str, reason: &str, message: &str) {
    let _ = app.emit(
        "agent-loop-stopped",
        json!({
            "session_id": session_id,
            "reason": reason,
            "message": message,
        }),
    );
    let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
}

fn emit_context_usage(app: &AppHandle, session_id: &str, settings: &Value, db: &AgentDb) {
    let messages = match load_messages_for_compact(db, session_id) {
        Ok(m) => m,
        Err(_) => return,
    };
    let spec = resolve_model_spec_for_session(session_id, settings);
    let decision = evaluate(&messages, &spec);
    let system_prompt = settings_get_str(settings, "systemPrompt");
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
    formatter: &dyn ChatFormatter,
) -> Result<StreamAccumulator, String> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), formatter.chat_path());
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
            let retryable = !is_fatal(&err_type)
                && (status.as_u16() == 429 || status.as_u16() == 503 || is_retryable(&err_type));
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
                    let delta = match formatter.parse_chunk(data) {
                        Ok(d) => d,
                        Err(_) => continue,
                    };
                    if !delta.content_delta.is_empty() {
                        acc.content.push_str(&delta.content_delta);
                        let _ = app.emit(
                            "agent-loop-delta",
                            json!({
                                "session_id": session_id,
                                "content": delta.content_delta,
                            }),
                        );
                    }
                    if !delta.thinking_delta.is_empty() {
                        acc.thinking.push_str(&delta.thinking_delta);
                        let _ = app.emit(
                            "agent-loop-thinking-delta",
                            json!({
                                "session_id": session_id,
                                "content": delta.thinking_delta,
                            }),
                        );
                    }
                    for tcd in &delta.tool_call_deltas {
                        let idx = tcd.index;
                        while acc.tool_calls.len() <= idx {
                            acc.tool_calls.push(AccTool::default());
                        }
                        let entry = &mut acc.tool_calls[idx];
                        if !tcd.id.is_empty() {
                            entry.id = tcd.id.clone();
                        }
                        if !tcd.name.is_empty() {
                            entry.name = tcd.name.clone();
                        }
                        if !tcd.arguments_delta.is_empty() {
                            entry.arguments.push_str(&tcd.arguments_delta);
                        }
                    }
                    if let Some(ref reason) = delta.finish_reason {
                        acc.finish_reason = reason.clone();
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
    insert_message(db, app, settings, &user_id, session_id, "user", user_message)?;

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
    let proxy_mode = settings_get_str(settings, "proxyMode").unwrap_or("system");
    let http_client = create_http_client(proxy_mode, http_proxy, None, None);

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

    let mut recent_tool_signatures: std::collections::VecDeque<String> =
        std::collections::VecDeque::with_capacity(4);

    let max_iterations = settings
        .get("maxIterations")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_ITERATIONS);
    let wall_clock_budget_secs = settings
        .get("wallClockBudgetMin")
        .and_then(|v| v.as_u64())
        .map(|n| n.saturating_mul(60))
        .unwrap_or(DEFAULT_WALL_CLOCK_BUDGET_SECS);
    let token_budget = settings
        .get("tokenBudget")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_TOKEN_BUDGET);
    let loop_started_at = std::time::Instant::now();
    // Create formatter based on apiCompatibility setting
    let openai_formatter = OpenAIChatFormatter;
    let anthropic_formatter = crate::agent::chat_formatter::AnthropicChatFormatter;
    let api_compat = settings_get_str(settings, "apiCompatibility").unwrap_or("openai-compatible");
    let formatter: &dyn ChatFormatter = match api_compat {
        "anthropic" => &anthropic_formatter,
        _ => &openai_formatter,
    };
    let model = settings_get_str(settings, "model").unwrap_or("gpt-4o-mini");

    let mut cumulative_input_tokens: usize = 0;
    let mut iter_count: usize = 0;

    loop {
        if iter_count >= max_iterations {
            emit_loop_stopped(
                app,
                session_id,
                "iteration_cap",
                &format!(
                    "Agent paused after {} iterations (configured cap). The task may need more work — reply 'continue' or raise the cap in settings.",
                    iter_count
                ),
            );
            return Ok(());
        }
        let elapsed_secs = loop_started_at.elapsed().as_secs();
        if elapsed_secs >= wall_clock_budget_secs {
            emit_loop_stopped(
                app,
                session_id,
                "wall_clock_budget",
                &format!(
                    "Agent paused after {}m wall-clock budget. Reply 'continue' to keep going or raise the budget in settings.",
                    elapsed_secs / 60
                ),
            );
            return Ok(());
        }
        iter_count += 1;
        // Progress heartbeat emitted before each loop iteration body so the UI
        // can keep a live status even while waiting on long operations.
        let _ = app.emit(
            "agent-loop-iteration",
            json!({
                "session_id": session_id,
                "iter_count": iter_count,
                "max_iterations": max_iterations,
            }),
        );
        crate::agent::conversation::prepare_for_llm(db, app, settings, session_id).await?;

    let history = load_active_history(db, session_id)?;
    let chat_msgs = build_llm_messages(&history, system_prompt.as_deref());
        let spec = resolve_model_spec_for_session(session_id, settings);
        let chat_msgs_values = llm_messages_to_values(&chat_msgs);
        cumulative_input_tokens = cumulative_input_tokens
            .saturating_add(crate::agent::token_counter::count_chat_messages(&chat_msgs_values, &spec));
        if cumulative_input_tokens >= token_budget {
            emit_loop_stopped(
                app,
                session_id,
                "token_budget",
                &format!(
                    "Agent paused after consuming {} input tokens (configured budget {}). Reply 'continue' to keep going or raise the budget in settings.",
                    cumulative_input_tokens, token_budget
                ),
            );
            return Ok(());
        }
        let raw_tools = settings.get("tools");
        let body = formatter.build_request(model, system_prompt.as_deref(), &chat_msgs, raw_tools, true);
        // Emitted immediately before the main streaming call starts. The first
        // `agent-loop-delta` event implicitly signals waiting finished.
        let _ = app.emit(
            "agent-loop-waiting-llm",
            json!({
                "session_id": session_id,
                "iter_count": iter_count,
            }),
        );

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
                formatter,
            ) => match res {
                Ok(a) => a,
                Err(e) => {
                    let _ = insert_message(db, app, settings, &new_id(), session_id, "assistant", &e);
                    let err_type = classify_error(&e).unwrap_or_default();
                    if is_fatal(&err_type) {
                        let _ = app.emit("agent-loop-error", json!({"session_id": session_id, "error": e}));
                    } else if e.contains("invalid_request_error") {
                        let _ = app.emit("agent-loop-error", json!({"session_id": session_id, "error": e}));
                    } else {
                        emit_loop_stopped(app, session_id, "llm_error", &e);
                    }
                    return Ok(());
                }
            },
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
            insert_message(db, app, settings, &assistant_message_id, session_id, "assistant", &payload)?;
            let _ = app.emit(
                "agent-loop-step-done",
                json!({"session_id": session_id, "message_id": assistant_message_id}),
            );
            let _ = app.emit("agent-loop-done", json!({"session_id": session_id}));
            return Ok(());
        }

        // Runaway-loop guard: if the LLM emits the exact same tool-call set
        // (name+arguments) for 3 consecutive iterations, treat it as a stuck
        // loop. Without this guard a misbehaving model can issue the same
        // mongo__insert_one until MAX_ITERATIONS is exhausted (see PR #440).
        let iter_signature: String = {
            let mut sigs: Vec<String> = acc
                .tool_calls
                .iter()
                .map(|t| format!("{}:{}", t.name, t.arguments))
                .collect();
            sigs.sort();
            sigs.join("|")
        };
        recent_tool_signatures.push_back(iter_signature.clone());
        if recent_tool_signatures.len() > 3 {
            recent_tool_signatures.pop_front();
        }
        if recent_tool_signatures.len() == 3
            && recent_tool_signatures.iter().all(|s| s == &iter_signature)
        {
            let stuck_msg = "Agent stopped: detected the same tool call repeating across 3 iterations with no progress. Try rephrasing your request or check the tool's previous results.";
            insert_message(db, app, settings, &assistant_message_id, session_id, "assistant", stuck_msg)?;
            let _ = app.emit(
                "agent-loop-error",
                json!({"session_id": session_id, "error": stuck_msg}),
            );
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
        insert_message(db, app, settings, &assistant_message_id, session_id, "assistant", &assistant_payload.to_string())?;
        let _ = app.emit(
            "agent-loop-step-done",
            json!({"session_id": session_id, "message_id": assistant_message_id}),
        );

        for (tc, tool_call_id) in acc.tool_calls.iter().zip(resolved_tool_ids.iter()) {
            let tool_call_id = tool_call_id.clone();
            let tool_name = tc.name.clone();
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
                    insert_message(db, app, settings, &new_id(), session_id, "tool", &err_msg.to_string())?;
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
                let err_content = format!("Tool '{}' is not allowed in this session.", tool_name);
                let deny_msg = json!({
                    "tool_call_id": tool_call_id,
                    "name": tool_name,
                    "content": err_content,
                });
                insert_message(db, app, settings, &new_id(), session_id, "tool", &deny_msg.to_string())?;
                let _ = app.emit(
                    "agent-loop-tool-result",
                    json!({
                        "session_id": session_id,
                        "tool_call_id": tool_call_id,
                        "error": true,
                        "envelope": { "summary": err_content },
                    }),
                );
                continue;
            }

            // Resolve connection config and check permissions BEFORE prompting the user,
            // so the user never sees a confirmation card for an impossible-to-execute tool.
            let resolved_config = match arguments_value
                .get("connection_id")
                .and_then(|v| v.as_str())
            {
                Some(conn_id) => match connections.get(conn_id) {
                    Some(cfg) => cfg.clone(),
                    None => {
                        update_tool_call_status(db, &tool_call_id, "failed")?;
                        let err_content = format!("Unknown connection_id '{}' for tool '{}'.", conn_id, tool_name);
                        let err_msg = json!({
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": err_content,
                        });
                        insert_message(db, app, settings, &new_id(), session_id, "tool", &err_msg.to_string())?;
                        let _ = app.emit(
                            "agent-loop-tool-result",
                            json!({
                                "session_id": session_id,
                                "tool_call_id": tool_call_id,
                                "error": true,
                                "envelope": { "summary": err_content },
                            }),
                        );
                        continue;
                    }
                },
                None => {
                    if !connections.is_empty() {
                        update_tool_call_status(db, &tool_call_id, "failed")?;
                        let err_content = format!(
                            "Tool '{}' requires a connection_id argument. Available connections: {}.",
                            tool_name,
                            connections.keys().cloned().collect::<Vec<_>>().join(", ")
                        );
                        let err_msg = json!({
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": err_content,
                        });
                        insert_message(db, app, settings, &new_id(), session_id, "tool", &err_msg.to_string())?;
                        let _ = app.emit(
                            "agent-loop-tool-result",
                            json!({
                                "session_id": session_id,
                                "tool_call_id": tool_call_id,
                                "error": true,
                                "envelope": { "summary": err_content },
                            }),
                        );
                        continue;
                    }
                    fallback_connection_config.clone()
                }
            };

            // Frontend confirmation (Allow/Deny card in Ask mode) is the primary
            // permission gate. Once the user approves, the tool executes — no
            // secondary permission check here. Real API-level errors from the
            // database server are surfaced via the executor.

            let (confirm_tx, confirm_rx) = oneshot::channel::<bool>();
            {
                let mut cm = confirm_map.lock().map_err(|e| e.to_string())?;
                cm.insert(tool_call_id.clone(), confirm_tx);
            }
            let _guard = ConfirmGuard::new(confirm_map.clone(), tool_call_id.clone());

            let _ = app.emit(
                "agent-loop-tool-call",
                json!({
                    "session_id": session_id,
                    "tool_call_id": tool_call_id,
                    "tool_name": tool_name,
                    "arguments": arguments_value,
                }),
            );

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
                insert_message(db, app, settings, &new_id(), session_id, "tool", &tool_deny_msg.to_string())?;
                continue;
            }

            update_tool_call_status(db, &tool_call_id, "approved")?;

            let envelope: ToolEnvelope = tokio::select! {
                biased;
                _ = &mut cancel_rx => {
                    update_tool_call_status(db, &tool_call_id, "failed")?;
                    let cancel_msg = json!({
                        "tool_call_id": tool_call_id,
                        "name": tool_name,
                        "content": format!("Tool '{}' was cancelled before completion. Partial execution may have occurred.", tool_name),
                    });
                    insert_message(db, app, settings, &new_id(), session_id, "tool", &cancel_msg.to_string())?;
                    return Err("cancelled".to_string());
                }
                res = tool_executor.execute(&tool_name, &arguments_value, &resolved_config) => match res {
                    Ok(env) => env,
                    Err(e) => {
                        update_tool_call_status(db, &tool_call_id, "failed")?;
                        let err_content = format!("Tool execution error: {}", e);
                        let error_msg = json!({
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": err_content,
                        });
                        insert_message(db, app, settings, &new_id(), session_id, "tool", &error_msg.to_string())?;
                        let _ = app.emit(
                            "agent-loop-tool-result",
                            json!({
                                "session_id": session_id,
                                "tool_call_id": tool_call_id,
                                "error": true,
                                "envelope": { "summary": err_content },
                            }),
                        );
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
            insert_message(db, app, settings, &new_id(), session_id, "tool", &tool_msg.to_string())?;
        }
    }
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

#[tauri::command]
pub async fn compact_agent_session(
    session_id: String,
    settings: Value,
    app: AppHandle,
) -> Result<Value, String> {
    let db_state: State<AgentDb> = app.state::<AgentDb>();
    let db: AgentDb = AgentDb(db_state.0.clone());
    let lock = crate::agent::conversation::lock_for(&session_id);
    let _guard = lock.lock().await;
    let outcome = crate::agent::compact::run_compact_manual(&session_id, &settings, &db, &app).await?;
    if let Some(info) = outcome {
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
    emit_context_usage(&app, &session_id, &settings, &db);
    let messages = load_messages_for_compact(&db, &session_id)?;
    let spec = resolve_model_spec_for_session(&session_id, &settings);
    let decision = evaluate(&messages, &spec);
    let system_prompt = settings_get_str(&settings, "systemPrompt");
    let tools = settings.get("tools");
    let used_tokens = count_projected_tokens(&messages, system_prompt, tools, &spec);
    let should_compact = used_tokens >= decision.trigger_at;
    Ok(json!({
        "session_id": session_id,
        "used_tokens": used_tokens,
        "capacity": decision.capacity,
        "context_window": spec.context_window,
        "output_reserve": spec.output_reserve,
        "trigger_at": decision.trigger_at,
        "should_compact": should_compact,
        "model": spec.model_id,
    }))
}

#[tauri::command]
pub async fn get_agent_context_usage(
    session_id: String,
    settings: Value,
    app: AppHandle,
) -> Result<Value, String> {
    let db_state: State<AgentDb> = app.state::<AgentDb>();
    let db: AgentDb = AgentDb(db_state.0.clone());
    let messages = load_messages_for_compact(&db, &session_id)?;
    let spec = resolve_model_spec_for_session(&session_id, &settings);
    let decision = evaluate(&messages, &spec);
    let system_prompt = settings_get_str(&settings, "systemPrompt");
    let tools = settings.get("tools");
    let used_tokens = count_projected_tokens(&messages, system_prompt, tools, &spec);
    let should_compact = used_tokens >= decision.trigger_at;
    Ok(json!({
        "session_id": session_id,
        "used_tokens": used_tokens,
        "capacity": decision.capacity,
        "context_window": spec.context_window,
        "output_reserve": spec.output_reserve,
        "trigger_at": decision.trigger_at,
        "should_compact": should_compact,
        "model": spec.model_id,
    }))
}
