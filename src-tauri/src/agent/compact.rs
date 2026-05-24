use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};

use crate::agent::config::{build_headers, get_base_url};
use crate::agent::loop_runner_support::{
    load_messages_for_compact, post_chat_completions_compact, replace_messages_with_summary,
    StoredMessage,
};
use crate::agent::model_registry::{
    apply_overrides, resolve_spec, usable_window, ModelSpec, TokenizerFamily,
};
use crate::agent::token_counter::estimate_stored_message;
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub const DEFAULT_COMPACT_RATIO: f64 = 0.75;
pub const SAFETY_BUFFER_TOKENS: usize = 13_000;
pub const KEEP_LAST_PAIRS: usize = 4;
#[allow(dead_code)]
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;

#[derive(Debug, Clone, Copy)]
pub struct CompactDecision {
    pub used_tokens: usize,
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
}

pub fn evaluate(messages: &[StoredMessage], spec: &ModelSpec) -> CompactDecision {
    let used: usize = messages
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, spec))
        .sum();
    let capacity = usable_window(spec);
    let trigger_at = compact_trigger_threshold(capacity);
    CompactDecision {
        used_tokens: used,
        capacity,
        trigger_at,
        should_compact: used >= trigger_at,
    }
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

/// Find a safe split point that preserves the (assistant+tool_calls, tool...) pairing
/// invariant. Walks backward from `proposed_split` while the boundary would orphan
/// a tool message or sever a tool_calls -> tool group.
pub fn safe_split_index(messages: &[StoredMessage], proposed_split: usize) -> usize {
    let mut split = proposed_split.min(messages.len());
    while split > 0 {
        let curr_role = messages
            .get(split)
            .map(|m| m.role.as_str())
            .unwrap_or("");
        let prev = &messages[split - 1];
        let prev_has_tool_calls = prev.role == "assistant"
            && serde_json::from_str::<Value>(&prev.content)
                .ok()
                .and_then(|v| v.get("tool_calls").cloned())
                .and_then(|tc| tc.as_array().map(|a| !a.is_empty()))
                .unwrap_or(false);
        if curr_role == "tool" || prev_has_tool_calls {
            split -= 1;
        } else {
            break;
        }
    }
    split
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

    let body = json!({
        "model": settings.get("model").and_then(|v| v.as_str()).unwrap_or("gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": COMPACT_SYSTEM_PROMPT},
            {"role": "user", "content": serde_json::to_string(&chat_msgs).unwrap_or_default()}
        ],
        "stream": false,
    });

    let base_url = get_base_url(settings);
    let headers = build_headers(settings)?;
    let http_proxy = settings
        .get("httpProxy")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let http_client = create_http_client(http_proxy, None);

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

pub async fn run_compact(
    session_id: &str,
    settings: &Value,
    db: &AgentDb,
) -> Result<Option<CompactionInfo>, String> {
    let messages = load_messages_for_compact(db, session_id)?;
    let spec = resolve_model_spec_for_session(session_id, settings);
    let decision = evaluate(&messages, &spec);
    if !decision.should_compact {
        return Ok(None);
    }

    let proposed = target_split_keeping_pairs(&messages, KEEP_LAST_PAIRS);
    let split = safe_split_index(&messages, proposed);
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

    let summary = summarize_with_llm(to_summarize, settings).await?;
    let payload = build_boundary_payload(&summary, pre_tokens, post_tokens, "auto");
    let ids_to_remove: Vec<String> = to_summarize.iter().map(|m| m.id.clone()).collect();
    let removed_count = ids_to_remove.len();
    replace_messages_with_summary(db, session_id, &ids_to_remove, &payload)?;

    Ok(Some(CompactionInfo {
        trigger: "auto".to_string(),
        pre_tokens,
        post_tokens,
        removed_count,
    }))
}
