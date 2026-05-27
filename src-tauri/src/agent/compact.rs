use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::agent::chat_formatter::{ChatFormatter, LlmMessage, OpenAIChatFormatter};
use crate::agent::config::{build_headers, get_base_url};
use crate::agent::loop_runner_support::{
    load_all_messages, load_messages_for_compact, new_id, now_ms,
    post_chat_completions_compact, StoredMessage,
};
use crate::agent::model_registry::{
    apply_overrides, resolve_spec, usable_window, ModelSpec, TokenizerFamily,
};
use crate::agent::token_counter::{count_chat_messages, count_tools_tokens, estimate_stored_message};
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub const DEFAULT_COMPACT_RATIO: f64 = 0.75;
pub const SAFETY_BUFFER_TOKENS: usize = 13_000;
pub const KEEP_LAST_PAIRS: usize = 4;
#[allow(dead_code)]
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;

#[derive(Debug, Clone, Copy)]
pub struct CompactDecision {
    pub capacity: usize,
    pub trigger_at: usize,
    pub should_compact: bool,
}

#[derive(Debug, Clone)]
pub struct CompactionInfo {
    pub trigger: String,
    pub pre_tokens: usize,
    pub post_tokens: usize,
    pub removed_count: usize,
    pub fallback_keep_pairs: Option<usize>,
}

pub fn evaluate(messages: &[StoredMessage], spec: &ModelSpec) -> CompactDecision {
    let used: usize = messages
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, spec))
        .sum();
    let capacity = usable_window(spec);
    let trigger_at = compact_trigger_threshold(capacity);
    CompactDecision {
        capacity,
        trigger_at,
        should_compact: used >= trigger_at,
    }
}

pub fn count_projected_tokens(
    messages: &[StoredMessage],
    system_prompt: Option<&str>,
    tools: Option<&Value>,
    spec: &ModelSpec,
) -> usize {
    let chat_msgs = crate::agent::loop_runner::project_messages(messages, system_prompt);
    let msg_tokens = count_chat_messages(&chat_msgs, spec);
    let tool_tokens = tools.map(|t| count_tools_tokens(t, spec)).unwrap_or(0);
    msg_tokens + tool_tokens
}

/// Claude-Code-style trigger: compact at min(ratio * capacity, capacity - safety_buffer).
/// Whichever fires first wins so very large windows still get a safety margin and
/// tiny windows (Ollama default 8k) still trigger via the ratio.
pub fn compact_trigger_threshold(capacity: usize) -> usize {
    let by_ratio = ((capacity as f64) * DEFAULT_COMPACT_RATIO) as usize;
    let by_buffer = capacity.saturating_sub(SAFETY_BUFFER_TOKENS);
    by_ratio.min(by_buffer).max(1)
}

pub fn resolve_model_spec(settings: &Value) -> ModelSpec {
    let provider = settings
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("OPEN_AI");
    let model = settings
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o-mini");
    let override_window = settings
        .get("contextWindowOverride")
        .and_then(|v| v.as_u64())
        .map(|n| n as usize);
    apply_overrides(resolve_spec(provider, model), override_window)
}

/// Tokenizer family cache, keyed by session_id. Once a session has been
/// resolved, subsequent calls force the same TokenizerFamily even if the
/// caller's settings (provider/model) drift mid-session. This prevents
/// context-usage percentage from jumping when the model picker is changed
/// or when settings are partially reloaded, which previously produced the
/// observed 62% -> 60% regression mid-loop.
static SESSION_TOKENIZER_CACHE: OnceLock<Mutex<HashMap<String, TokenizerFamily>>> = OnceLock::new();

pub fn resolve_model_spec_for_session(session_id: &str, settings: &Value) -> ModelSpec {
    let mut spec = resolve_model_spec(settings);
    let cache = SESSION_TOKENIZER_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut map = cache.lock().expect("tokenizer cache poisoned");
    match map.get(session_id) {
        Some(locked) => {
            spec.tokenizer = *locked;
        }
        None => {
            map.insert(session_id.to_string(), spec.tokenizer);
        }
    }
    spec
}

fn assistant_has_tool_calls(message: &StoredMessage) -> bool {
    message.role == "assistant"
        && serde_json::from_str::<Value>(&message.content)
            .ok()
            .and_then(|v| v.get("tool_calls").cloned())
            .and_then(|tc| tc.as_array().map(|a| !a.is_empty()))
            .unwrap_or(false)
}

fn is_safe_boundary(messages: &[StoredMessage], split: usize) -> bool {
    if split == 0 || split > messages.len() {
        return false;
    }
    let curr_role = messages.get(split).map(|m| m.role.as_str()).unwrap_or("");
    let prev = &messages[split - 1];
    curr_role != "tool" && !assistant_has_tool_calls(prev)
}

/// Find a safe split point that preserves the (assistant+tool_calls, tool...) pairing
/// invariant. Walks backward from `proposed_split` while the boundary would orphan
/// a tool message or sever a tool_calls -> tool group.
pub fn safe_split_index(messages: &[StoredMessage], proposed_split: usize) -> usize {
    let mut split = proposed_split.min(messages.len());
    while split > 0 && !is_safe_boundary(messages, split) {
        split -= 1;
    }
    split
}

/// Forward fallback for tool-heavy histories where backward scan collapses to zero.
/// Starting at `proposed_split`, walks forward until finding a boundary that does
/// not split assistant tool_calls from following tool messages.
pub fn safe_split_index_forward(messages: &[StoredMessage], proposed_split: usize) -> usize {
    let start = proposed_split.min(messages.len());
    (start..=messages.len())
        .find(|split| is_safe_boundary(messages, *split))
        .unwrap_or(0)
}

/// Compute a target split that keeps the last N user/assistant pairs intact.
pub fn target_split_keeping_pairs(messages: &[StoredMessage], keep_pairs: usize) -> usize {
    let mut pairs_seen = 0usize;
    for (idx, m) in messages.iter().enumerate().rev() {
        if m.role == "user" {
            pairs_seen += 1;
            if pairs_seen >= keep_pairs {
                return idx;
            }
        }
    }
    0
}

pub const COMPACT_SYSTEM_PROMPT: &str = "Summarize this conversation so it can continue without the full history.

Output exactly this Markdown structure, keeping all sections even if empty:

## What We Were Doing
- [The user's goal and current task — one or two sentences]

## What We Found / Did
- [Key results, queries run, data discovered, decisions made]

## Next Steps
- [What to do next, or \"(none)\"]

## Critical Details
- [Exact names to preserve: connections, indexes, fields, query strings, error messages]

Rules:
- Bullets only, no prose.
- Preserve exact identifiers verbatim.
- Do not mention this summary process.";

pub async fn summarize_with_llm(
    messages_to_summarize: &[StoredMessage],
    settings: &Value,
) -> Result<String, String> {
    let chat_msgs: Vec<Value> = messages_to_summarize
        .iter()
        .map(|m| json!({"role": m.role, "content": m.content}))
        .collect();

    let formatter = OpenAIChatFormatter;
    let model = settings
        .get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("gpt-4o-mini");
    let user_msg_text = serde_json::to_string(&chat_msgs).unwrap_or_default();
    let llm_messages = vec![LlmMessage {
        role: "user".into(),
        text_content: user_msg_text,
        tool_calls: None,
        tool_call_id: None,
        thinking: None,
    }];
    let body = formatter.build_request(model, Some(COMPACT_SYSTEM_PROMPT), &llm_messages, None, false);

    let base_url = get_base_url(settings);
    let headers = build_headers(settings)?;
    let http_proxy = settings
        .get("httpProxy")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let proxy_mode = settings
        .get("proxyMode")
        .and_then(|v| v.as_str())
        .unwrap_or("system");
    let http_client = create_http_client(proxy_mode, http_proxy, None, None);

    let resp = post_chat_completions_compact(&http_client, &base_url, headers, body).await?;
    let payload: Value = resp.json().await.map_err(|e| e.to_string())?;
    let summary = payload
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if summary.is_empty() {
        return Err("LLM returned empty summary".to_string());
    }
    Ok(summary)
}

pub fn build_boundary_payload(
    summary: &str,
    pre_tokens: usize,
    post_tokens: usize,
    trigger: &str,
) -> String {
    let compacted_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    json!({
        "_compact_boundary": true,
        "trigger": trigger,
        "summary": summary,
        "pre_tokens": pre_tokens,
        "post_tokens": post_tokens,
        "compacted_at": compacted_at,
    })
    .to_string()
}

pub async fn run_compact_with_events(
    session_id: &str,
    settings: &Value,
    db: &AgentDb,
    app: &AppHandle,
) -> Result<Option<CompactionInfo>, String> {
    run_compact_inner(session_id, settings, db, Some(app), "auto", false).await
}

/// User-forced compaction: bypasses should_compact, tags boundary as "manual",
/// and emits compacting:start/end events.
pub async fn run_compact_manual(
    session_id: &str,
    settings: &Value,
    db: &AgentDb,
    app: &AppHandle,
) -> Result<Option<CompactionInfo>, String> {
    run_compact_inner(session_id, settings, db, Some(app), "manual", true).await
}

/// Auto-compaction split fallback strategy:
/// 1) Try backward-safe split with KEEP_LAST_PAIRS=4.
/// 2) If it collapses to zero, retry with keep_pairs 2, then 1.
/// 3) If still zero, do a forward walk from the keep_pairs=1 proposed split.
/// Emits `agent-loop-compacting` phase start/end around summarize_with_llm
/// when an app handle is provided.
async fn run_compact_inner(
    session_id: &str,
    settings: &Value,
    db: &AgentDb,
    app: Option<&AppHandle>,
    trigger: &str,
    force: bool,
) -> Result<Option<CompactionInfo>, String> {
    // Manual compaction loads ALL session messages, ignoring existing
    // compaction boundaries, to compact the full conversation.
    // Auto compaction only loads from the last boundary onward.
    let messages = if force {
        load_all_messages(db, session_id)?
    } else {
        load_messages_for_compact(db, session_id)?
    };
    let spec = resolve_model_spec_for_session(session_id, settings);
    let decision = evaluate(&messages, &spec);
    if !force && !decision.should_compact {
        return Ok(None);
    }

    let keep_candidates: [usize; 3] = [KEEP_LAST_PAIRS, 2, 1];
    let split_result = keep_candidates.iter().find_map(|keep_pairs| {
        let proposed = target_split_keeping_pairs(&messages, *keep_pairs);
        let split = safe_split_index(&messages, proposed);
        (split > 0).then_some((split, *keep_pairs, proposed))
    });

    let (split, fallback_keep_pairs) = if let Some((split, keep_pairs, _)) = split_result {
        let fallback = (keep_pairs != KEEP_LAST_PAIRS).then_some(keep_pairs);
        (split, fallback)
    } else {
        let fallback_keep = 1usize;
        let fallback_proposed = target_split_keeping_pairs(&messages, fallback_keep);
        let forward_split = safe_split_index_forward(&messages, fallback_proposed);
        if forward_split == 0 {
            let warning_message = "Context compaction failed: history has too many consecutive tool calls — consider clearing the session or asking a more focused question";
            if let Some(app) = app {
                let _ = app.emit(
                    "agent-loop-warning",
                    json!({
                        "session_id": session_id,
                        "warning": warning_message,
                    }),
                );
            }
            return Err(warning_message.to_string());
        }
        (forward_split, Some(fallback_keep))
    };

    if split == 0 {
        return Err("compact: cannot find safe split".to_string());
    }

    let to_summarize = &messages[..split];
    let pre_tokens: usize = to_summarize
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, &spec))
        .sum();
    let post_tokens: usize = messages[split..]
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, &spec))
        .sum();

    if let Some(app) = app {
        let _ = app.emit(
            "agent-loop-compacting",
            json!({
                "session_id": session_id,
                "phase": "start",
            }),
        );
    }
    let summary_result = summarize_with_llm(to_summarize, settings).await;
    if let Some(app) = app {
        let _ = app.emit(
            "agent-loop-compacting",
            json!({
                "session_id": session_id,
                "phase": "end",
            }),
        );
    }
    let summary = summary_result?;
    let payload = build_boundary_payload(&summary, pre_tokens, post_tokens, trigger);
    let ids_to_remove: Vec<String> = to_summarize.iter().map(|m| m.id.clone()).collect();
    let removed_count = ids_to_remove.len();
    insert_compact_boundary(db, session_id, &ids_to_remove, &payload)?;

    Ok(Some(CompactionInfo {
        trigger: trigger.to_string(),
        pre_tokens,
        post_tokens,
        removed_count,
        fallback_keep_pairs,
    }))
}

fn insert_compact_boundary(
    db: &AgentDb,
    session_id: &str,
    _removed_ids: &[String],
    boundary_payload: &str,
) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let boundary_ts: i64 = now_ms();

    // Each boundary uses now_ms() so it gets a unique timestamp.
    // load_messages_for_compact loads rows where created_at >= last
    // boundary_ts — keeping the boundary plus post-compaction appends
    // while excluding rows summarized in previous compactions.
    tx.execute(
        "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![new_id(), session_id, "system", boundary_payload, boundary_ts],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
