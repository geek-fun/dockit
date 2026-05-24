# Agent Reliability & Performance Issues — Root Cause Analysis

**Status**: Diagnosis complete, awaiting implementation approval
**Source session**: `4d4b9e71-6216-4617-8299-f4a0e86aa81a` (1406 messages, ~17 min runtime)
**Related PR**: #440 (`feat/ai-context-management`) — fixes partial compaction-deletion bug; this doc covers the remaining 4 issues observed in the same session.

---

## SQLite Forensic Evidence

Extracted from `~/Library/Application Support/club.geekfun.dockit/agent.sqlite` for the session above.

| Metric | Value |
|---|---|
| Total messages | 1406 (27 user / 157 assistant / 1186 tool / 36 system boundaries) |
| Auto-compactions in 17 min | **36** |
| Minimum gap between compactions | **8 seconds** (thrashing) |
| Messages still present before first boundary | **404** (confirms pre-PR#440 bug: `replace_messages_with_summary` never deleted) |
| Max tool calls in a single assistant message | **97** (parallel function calling at extreme scale) |
| Largest assistant message | **46 KB** (huge `thinking` block) |
| Tool call distribution | **1081 of 1186 are `mongo__insert_one`** (no batching to `insertMany`) |
| Post-last-boundary active window | 528 messages / 277 KB |
| SQLite DB size | **3.1 MB** → 12 GB RAM is purely frontend/webview, not DB |
| `is_compacted` column | Exists but **never set** (dead column) |
| Largest single tool_result_store entry | 32 KB (truncation cap somewhere) |

---

## Issue 1 — Scroll Sticky Breaks During Tool Execution

### Symptom
"Sometimes when executing tool calling, scroll-sticky-to-bottom is not working, I can't see the latest message after then."

### Root cause
Two scroll contexts exist:

1. **Outer**: `ScrollArea` viewport in `chat-panel.vue:203–263`, scrolled by `watch(props.messages)`.
2. **Inner**: Tool results stream into `<pre class="tool-result-pre">` inside `.activity-body` (in `agent-message-bubble.vue:681–694`), which has `max-height: 260px; overflow-y: auto`.

When new tool-result content lands in the inner scroller, outer `scrollHeight` stops growing once the inner scroller hits its cap, so `el.scrollTo(scrollHeight)` becomes a no-op for that content.

**Secondary**: `behavior: 'smooth'` during 10+ updates/sec gets cancelled mid-animation, leaving the viewport short of `scrollHeight`.

### Proposed fixes
1. In `agent-message-bubble.vue`, when `toolCall.result` updates AND the message is the last in the chat AND outer `stickToBottom` is true, run `nextTick(() => activityBody.scrollTop = activityBody.scrollHeight)`.
2. Switch to `behavior: 'auto'` (no smooth) during active streaming. Detect via `message.status === 'streaming'`.
3. Defer the scroll listener attach with a `watchEffect` on `scrollbarRef.value?.viewportElement` so it can't miss the initial mount race.

---

## Issue 2 — Compaction Lifecycle Is Broken

### Symptom
"Auto-compaction not happening even after >85% context occupied, and sometimes tokens reduced a bit like 62% → 60% without compaction happening."

### Current implementation (`compact.rs:13–58`, `loop_runner.rs:572–601`)
- `DEFAULT_COMPACT_RATIO = 0.75`; `SAFETY_BUFFER_TOKENS = 13_000`
- `trigger_at = min(capacity * 0.75, capacity - 13_000)` (75% in practice for large windows)
- `run_compact` is called at the **top of every loop iteration** — only inside `run_agent_loop_inner`
- FE `context-indicator.vue` reads usage via the `agent-context-usage` event, emitted at the same point

### Root cause: compaction is tied to the loop, not the context

Compaction only happens at iteration boundaries while the loop is actively spinning. The moment the loop exits — for any reason — compaction stops being checked, even though context keeps growing as the user reads results, opens tool outputs, or starts a new turn that piles onto the existing window.

The loop exits when:
1. LLM returns `tool_calls.is_empty()` (normal "I'm done" stop) — `loop_runner.rs:624–641`
2. `MAX_ITERATIONS = 20` hit — silent exit, no warning
3. Runaway-guard fires (same tool call 3× in a row) — `loop_runner.rs:660–677`
4. Stream error / network error / cancellation

After ANY of these, the context can grow well past the threshold. User sees the indicator pulse red at 85%+ and nothing happens. The only ways to recover today:
- Click "Compact now" button manually (works, but most users won't notice)
- Send a new message → triggers `run_agent_loop` → first iter runs `run_compact` → finally compacts

This is why the user perceives "compaction doesn't fire at >85%". It does fire, but only after they take an action that restarts the loop. SQLite confirms this: all 36 compaction boundaries in the session happened inside loop runs; **none** during the gaps between user messages.

### Why opencode / Claude Code / Cursor don't have this problem

These tools treat compaction as a **continuous background concern** that the agent loop *uses* but doesn't *own*. The compaction decision is checked:
- Before sending any request to the LLM (current behavior — kept)
- Immediately after any message append (user turn, tool result, assistant turn) — **missing**
- On session resume after restart — **missing**

The context window is the property of the conversation, not the loop. The loop just consumes whatever the conversation manager hands it.

### Sub-issue: 62% → 60% drop without visible compaction
1. **`microcompact` silently truncates long tool bodies** (`compact.rs:116–138, 237–252`). Inserts a boundary row with `removed_count = 0` and emits `agent-loop-summary-injected`, but the UI either doesn't render the marker or renders it identically to a full compaction. User sees tokens drop with no marker explanation.
2. Microcompact only runs **inside `run_compact`, after `decision.should_compact` is true** — so a 62%→60% drop while indicator stays below 75% threshold cannot be microcompact. The likely cause is tokenizer drift between two `emit_context_usage` calls (model spec resolution falling back to char-heuristic estimator).

### Compaction thrash sub-issue
36 compactions / 17 min with 8s minimum gap means after each compaction the post-cutoff window almost immediately returns to threshold. Confirmed contributors from SQLite:
- Assistant messages with up to **97 tool_calls** (huge `tool_calls` JSON) survive compaction in the keep-last-N-pairs window
- `thinking` blocks up to **46 KB** are not touched by `microcompact` (only `tool` role content is)
- Tool responses for `mongo__insert_one` × 1081 each get full `safe_split_index` rollback because they can't sever the assistant→tool pairing

### Redesign: compaction as a conversation invariant

**Architectural change**: introduce a `ConversationManager` (or extend `session_store`) that owns the rule "the active context never exceeds `trigger_at`". Every operation that mutates the conversation goes through it:

```
ConversationManager.append(message) → maybe_compact() → emit_context_usage()
```

Touchpoints that must route through it:
- `insert_message` for user input (currently bypasses to direct SQLite write)
- `insert_message` for tool results (after each tool execution)
- `insert_message` for assistant turns (end of stream)
- Session load on app start (`load_session`)
- Settings change that lowers `context_window` (e.g., user picks a smaller model mid-session)

**Behavioral specification:**

| Trigger event | Action |
|---|---|
| Loop iteration starts | Check + compact if needed (kept) |
| Tool result inserted | Check + compact if needed (NEW) |
| User message inserted | Check + compact if needed (NEW) |
| Assistant turn finalized | Check + compact if needed (NEW) |
| Session loaded from disk | Check + compact if needed (NEW) |
| Settings updated | Re-check trigger; compact if newly over (NEW) |
| `MAX_ITERATIONS` hit / loop exits | Check + compact if needed (NEW) — so the next user turn doesn't blow up |

This makes compaction **proactive** — by the time the indicator paints, the conversation is already within budget. There is no "idle window" where the indicator climbs while nothing happens.

### Concurrency
- `maybe_compact()` must be guarded by a per-session async mutex to prevent two simultaneous compactions (e.g., loop iter + tool-result-insert racing).
- If a compaction is already in flight, new append events queue behind it; once compaction completes, they re-evaluate against the new state.

### Proposed fixes
1. **Implement `ConversationManager.maybe_compact()` and route ALL message appends through it** (the core redesign above).
2. **Per-session async mutex** to serialize compaction attempts.
3. **Honor `autoCompact` setting** (already wired) at the manager level; if disabled, manager just emits the usage event without compacting.
4. **Distinguish microcompact in the UI**: `removed_count == 0` → render as "Trimmed verbose tool outputs"; `removed_count > 0` → render as "Compacted N messages".
5. **Extend `microcompact`** to also truncate `thinking` field over 2 KB, and limit `tool_calls` array length to last N entries per assistant message. Addresses the 36-thrash.
6. **Lock tokenizer family per session** at session creation; never fall back mid-session. Eliminates the 62%→60% noise.
7. **Keep `DEFAULT_COMPACT_RATIO = 0.75`** for now (matches Claude Code); the user's "85%" perception was about *when the indicator pulses red without action*, which the redesign fixes by making compaction proactive — the indicator will hover at or below trigger threshold rather than climbing past it.

### `autoCompact` default behavior (UX note)
The code default for `autoCompact` is already `true` (`appStore.ts:234, 349`; `useChatAgent.ts:323, 571` — all `?? true`). However, users whose persisted state was written before the field existed, or who toggled it off intentionally, end up with `autoCompact: false`, and the in-loop compaction is silently skipped (`loop_runner.rs:578`). This is the most likely explanation for "compaction never fires" reports that happen even inside an active loop.

Recommended UX changes:
- **Surface the disabled state prominently**: when `autoCompact === false`, the `context-indicator` should show a small unlocked-padlock or "OFF" badge and the popover should warn that automatic compaction is disabled.
- **Warn when usage exceeds threshold and auto-compact is OFF**: render an inline notice "Auto-compact is off. Context will keep growing until you click Compact now." with a one-click toggle to enable it.
- **Migration on app start**: if a persisted llm-settings blob is loaded that lacks `chat.autoCompact`, explicitly write the default `true` back to storage so the setting is visible/auditable in the Settings UI rather than implicit.

---

## Issue 3 — Agent Stops Mid-Task ("Continue" Pattern)

### Symptom
"Data studio agent stopped several times without any reason, I need to ask to continue. As an AI agent, it should auto running → tool executing → context window checking → auto-compaction if needed → permission checking → interactive popup to ask user input etc. automatically."

### Root cause
`MAX_ITERATIONS = 20` hard cap (`loop_runner.rs:22`). When hit, the loop emits `agent-loop-done` and returns `Ok(())` — **a silent normal completion, no error**. UI then requires user to send "continue" which re-invokes `runAgentLoop`.

Math: 1186 tool calls / 20 = **~60 manual continues required** for that one session.

**Secondary**: `dataStudioStore.AgentSession.maxIterations` exists in the FE (default 10) but **backend ignores it entirely** — settings field never read. Dead config.

There is **no dedicated `continue_agent_loop` command**. "Continue" works by re-calling `runAgentLoop` with the same session — fragile.

### Proposed fixes
1. **Honor session `maxIterations` from settings**: in `loop_runner.rs:572`, `let max_iter = settings.get("maxIterations").and_then(|v| v.as_u64()).unwrap_or(200) as usize;`. Pass from FE via `useChatAgent.ts:579`.
2. **Raise default from 20 → 200**. For an 8k-row task this still gives the agent room.
3. **Add `continue_agent_loop` Tauri command** that resumes a stopped session from its last assistant message without requiring a new user prompt.
4. **Auto-continue on `finish_reason: 'tool_calls'`**: emit `finish_reason` in `agent-loop-step-done`; FE auto-invokes continue if loop ended only because of the iteration cap (not because LLM said "stop").
5. **Switch to a hybrid stop policy**: iteration cap (e.g., 500) OR token-budget OR wall-clock budget (e.g., 30 min) — whichever comes first. This is the pattern Claude Code, Cursor, OpenCode all use.

---

## Issue 4 — 12 GB RAM + Scroll Jank

### Symptom
"DocKit app memory usage can reach 12 GB+ which doesn't make sense for a lightweight desktop application, and scroll is not smooth after the long task running a while."

### Context
SQLite is only **3.1 MB**, so the leak is purely in webview/JS heap.

### Ranked causes

**Rank 1 (dominant): Naive `v-for` over 1406 messages with no virtualization**
- `chat-panel.vue:18` renders every message as a full `AgentMessageBubble`.
- Each bubble contains `MarkdownRender` + tool-call `<details>` blocks + tool-result `<pre>` with up to 32 KB content.
- 1406 messages × multiple DOM trees × Vue reactive wrappers = enormous DOM + heap.
- **Vue devtools attached in dev mode multiplies this by 3–5×.**

**Rank 2: `MarkdownRender` re-parses on every streaming chunk**
- `markdown-render.vue:3` uses `v-html="parsedMarkdown"` recomputed on every `props.markdown` change.
- During streaming, `updateStreamingContent` fires per-token → markdown-it re-parses + highlight.js re-highlights the entire message body **per character**.
- For a 46 KB assistant message, that's tens of thousands of re-parses.

**Rank 3: Pinia reactive store holds 1406 messages × full content**
- `dataStudioStore.ts`: `sessions[id].messages = [...]` — all message bodies, all tool results stored as reactive proxies.
- `pinia-plugin-persistedstate` likely persists this to localStorage, doubling memory.
- Tool results (max 32 KB each × ~1186) kept verbatim in reactive state even though they're already in SQLite.

**Rank 4: Tauri `listen()` accumulation**
- `useChatAgent.ts` registers ~7 event listeners per session. If the session-hydrator runs multiple times (on session switch / reload), listeners can stack.
- `markdown-render.vue:91` adds `document.addEventListener('chatbot-code-actions', ...)` per instance — 1406 listeners on `document`.

**Rank 5: Monaco editor instances** — likely irrelevant here (no code editor per message).

### Does the "8 KB rows tool result" explanation hold?
Partially. The 8k rows were split across 1081 separate `mongo__insert_one` tool calls, each returning ~50 bytes (`{"inserted_id":"..."}`). Tool results aren't individually huge. The dominant memory hog is the **sheer count of reactive messages × DOM nodes × markdown re-renders**, not the size of individual tool results. The largest single objects are assistant `thinking` blocks (up to 46 KB).

### Proposed fixes (priority order)
1. **Virtualize the chat list** (`vue-virtual-scroller` or `virtua`). Single biggest win — likely 80%+ memory reduction.
2. **Throttle streaming markdown render** to 100 ms (instead of per-token). Use shallow markdown for streaming content; full parse only when streaming completes.
3. **Lazy-load tool results from SQLite**: keep only `result_preview` (first 200 chars) + `tool_call_id` in reactive store; fetch full result on-demand when `<details>` opens. SQLite already has the data.
4. **Move `chatbot-code-actions` listener** to a single global mount in `App.vue` instead of per-`MarkdownRender`.
5. **Audit `listen()` cleanup paths** in `useChatAgent.ts` — guarantee `unlistenAll()` on session switch.
6. **Disable Vue devtools in prod builds** if not already (check `tauri.conf.json` `devtools: false`).
7. **Prune old messages from reactive store**: after a compaction boundary, drop pre-boundary messages from `state.messages` (already in SQLite + summarized). Currently FE keeps them all.
8. **Use `markRaw` or `shallowRef`** for completed (non-streaming) message bodies — strips reactivity overhead.

---

## Cross-Cutting Architectural Recommendation

The 4 issues share a root: **the agent loop treats long tasks as edge cases**. To make DocKit professional tooling for long-running workflows:

| Capability | Current | Proposed |
|---|---|---|
| Iteration limit | Hard 20, ignored from FE | Configurable, default 200, hybrid time/token budget |
| Compaction trigger | Loop-iter only | Routed through `ConversationManager`: every message append checks threshold |
| Microcompact visibility | Silent | UI marker with `removed_count` distinction |
| Message store | Full reactive load | Virtualized + lazy tool results |
| Scroll sticky | Outer only | Outer + inner activity-body |
| Tokenizer | Per-call resolution | Per-session locked |

---

## Suggested PR Decomposition

Three follow-up PRs, in order of impact:

1. **PR-441 perf** — virtualize chat list, throttle markdown, lazy tool results. Fixes Issue 4.
2. **PR-442 agent-loop** — configurable iteration cap, default 200, hybrid budget, `continue_agent_loop` command, auto-continue on `finish_reason: tool_calls`. Fixes Issue 3.
3. **PR-443 compaction** — introduce `ConversationManager` that routes all message appends through `maybe_compact()`, per-session async mutex, microcompact UI marker, tokenizer lock per session, microcompact extended to `thinking` blocks, inner-scroll fix from Issue 1. Fixes Issues 1 & 2.

---

## Key Files for Implementation Reference

**Backend (Rust)**:
- `src-tauri/src/agent/loop_runner.rs` — MAX_ITERATIONS, runaway guard
- `src-tauri/src/agent/loop_runner_support.rs` — `replace_messages_with_summary` (PR#440 fix)
- `src-tauri/src/agent/compact.rs` — threshold, `run_compact`, `microcompact`
- `src-tauri/src/agent/token_counter.rs`, `model_registry.rs` — token formula, context window lookup
- `src-tauri/src/agent/session_store.rs` — in-memory caches

**Frontend (Vue)**:
- `src/components/chat-panel.vue` — outer scroll, v-for over messages
- `src/components/agent-message-bubble.vue` — inner activity-body scroll
- `src/components/markdown-render.vue` — per-token re-parse hot spot
- `src/components/context-indicator.vue` — token % formula
- `src/components/ui/ScrollArea.vue` — viewport ref
- `src/views/data-studio/index.vue`, `src/layout/components/chatbot-box.vue` — chat hosts
- `src/composables/useChatAgent.ts`, `useDataStudioChatAgent.ts`, `useSidebarChatAgent.ts` — listen/unlisten audit
- `src/store/dataStudioStore.ts`, `src/store/chatStore.ts` — unbounded `messages[]`
- `src/datasources/agentApi.ts` — backend command map
