use serde_json::{json, Value};

use crate::agent::config::{build_headers, get_base_url};
use crate::agent::loop_runner_support::{
    load_messages_for_compact, post_chat_completions_compact, replace_messages_with_summary,
    StoredMessage,
};
use crate::agent::model_registry::{apply_overrides, resolve_spec, usable_window, ModelSpec};
use crate::agent::token_counter::estimate_stored_message;
use crate::common::http_client::create_http_client;
use crate::db::AgentDb;

pub const DEFAULT_COMPACT_RATIO: f64 = 0.75;
pub const SAFETY_BUFFER_TOKENS: usize = 13_000;
pub const KEEP_LAST_PAIRS: usize = 4;
pub const MICROCOMPACT_TOOL_BODY_KEEP_CHARS: usize = 800;
#[allow(dead_code)]
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;

#[derive(Debug, Clone, Copy)]
pub struct CompactDecision {
    pub used_tokens: usize,
    pub capacity: usize,
    pub trigger_at: usize,
    pub should_compact: bool,
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

pub fn microcompact(messages: &mut Vec<StoredMessage>) -> usize {
    let cutoff = messages.len().saturating_sub(KEEP_LAST_PAIRS * 2);
    let mut elided = 0usize;
    for m in messages.iter_mut().take(cutoff) {
        if m.role == "tool" && m.content.len() > MICROCOMPACT_TOOL_BODY_KEEP_CHARS {
            if let Ok(mut v) = serde_json::from_str::<Value>(&m.content) {
                let inner = v
                    .get("content")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                if inner.len() > MICROCOMPACT_TOOL_BODY_KEEP_CHARS {
                    let mut head: String = inner.chars().take(MICROCOMPACT_TOOL_BODY_KEEP_CHARS).collect();
                    head.push_str("\n…[elided by microcompact]…");
                    v["content"] = Value::String(head);
                    m.content = v.to_string();
                    elided += 1;
                }
            }
        }
    }
    elided
}

pub const COMPACT_SYSTEM_PROMPT: &str = r#"You are summarizing a long conversation between a user and an AI assistant working on database tasks (Elasticsearch, OpenSearch, DynamoDB).

Produce a STRUCTURED summary with the following nine sections, in this exact order. Be concrete, preserve names, ids, paths, queries, error strings, and decisions verbatim. Do NOT speculate.

1. Primary Intent — What the user is ultimately trying to accomplish.
2. Key Technical Concepts — Schemas, tables, indexes, queries, API surfaces involved.
3. Files & Code — File paths and code snippets that were inspected or modified, with brief purpose.
4. Errors & Fixes — Errors encountered with verbatim error strings and the fix applied (or attempted).
5. All User Messages — One bullet per user message, paraphrased tightly. Preserve order.
6. Pending Tasks — Work items not yet finished.
7. Current Work — What was happening immediately before this summary.
8. Next Step — The single next action that should be taken.
9. Preserved Tool Calls — Any in-flight tool_call ids that have NOT been answered with a matching tool result; list them so the next turn can avoid duplicating work.

Output plain text with the section headers exactly as above. No preamble, no apology, no closing remarks."#;

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
    preserved_tool_calls: &[String],
) -> String {
    json!({
        "_compact_boundary": true,
        "pre_tokens": pre_tokens,
        "post_tokens": post_tokens,
        "preserved_tool_calls": preserved_tool_calls,
        "summary": summary,
    })
    .to_string()
}

/// Collect tool_call ids from the assistant message at `split-1` that do NOT
/// have a matching tool reply in the kept tail. Those must be surfaced so the
/// next LLM turn knows they were dropped.
pub fn collect_orphan_tool_calls(messages: &[StoredMessage], split: usize) -> Vec<String> {
    if split == 0 || split > messages.len() {
        return Vec::new();
    }
    let prev = &messages[split - 1];
    if prev.role != "assistant" {
        return Vec::new();
    }
    let parsed: Value = match serde_json::from_str(&prev.content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let tool_call_ids: Vec<String> = parsed
        .get("tool_calls")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|tc| tc.get("id").and_then(|i| i.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if tool_call_ids.is_empty() {
        return Vec::new();
    }
    let tail = &messages[split..];
    let answered: std::collections::HashSet<String> = tail
        .iter()
        .filter(|m| m.role == "tool")
        .filter_map(|m| serde_json::from_str::<Value>(&m.content).ok())
        .filter_map(|v| {
            v.get("tool_call_id")
                .and_then(|i| i.as_str())
                .map(String::from)
        })
        .collect();
    tool_call_ids
        .into_iter()
        .filter(|id| !answered.contains(id))
        .collect()
}

pub async fn run_compact(
    session_id: &str,
    settings: &Value,
    db: &AgentDb,
) -> Result<Option<CompactDecision>, String> {
    let mut messages = load_messages_for_compact(db, session_id)?;
    let spec = resolve_model_spec(settings);
    let decision = evaluate(&messages, &spec);
    if !decision.should_compact {
        return Ok(Some(decision));
    }

    let _ = microcompact(&mut messages);
    let post_micro = evaluate(&messages, &spec);
    if !post_micro.should_compact {
        let ids_to_remove: Vec<String> = Vec::new();
        replace_messages_with_summary(
            db,
            session_id,
            &ids_to_remove,
            &build_boundary_payload("[microcompact: elided old tool bodies]", 0, 0, &[]),
        )?;
        return Ok(Some(post_micro));
    }

    let proposed = target_split_keeping_pairs(&messages, KEEP_LAST_PAIRS);
    let split = safe_split_index(&messages, proposed);
    if split == 0 {
        return Err("compact: cannot find safe split".to_string());
    }

    let to_summarize = &messages[..split];
    let preserved = collect_orphan_tool_calls(&messages, split);
    let pre_tokens: usize = to_summarize
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, &spec))
        .sum();
    let post_tokens: usize = messages[split..]
        .iter()
        .map(|m| estimate_stored_message(&m.role, &m.content, &spec))
        .sum();

    let summary = summarize_with_llm(to_summarize, settings).await?;
    let payload = build_boundary_payload(&summary, pre_tokens, post_tokens, &preserved);
    let ids_to_remove: Vec<String> = to_summarize.iter().map(|m| m.id.clone()).collect();
    replace_messages_with_summary(db, session_id, &ids_to_remove, &payload)?;

    let post = evaluate(&load_messages_for_compact(db, session_id)?, &spec);
    Ok(Some(post))
}
