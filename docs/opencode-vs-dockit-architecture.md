# OpenCode vs DocKit: Deep Architectural Comparison

> **Scope**: Agent loop & execution model · Tool system · Session & state · Provider abstraction · Robustness features  
> **Sources**: opencode (`anomalyco/opencode` mirror of sst/opencode) and DocKit (this repo, post-robustness-refactor)  
> **TL;DR**: OpenCode is a **general-purpose, server-grade agent framework** (TypeScript/Bun, SQLite-backed, multi-provider, plugin-based tools). DocKit is a **domain-specific embedded agent** (Vue + Rust/Tauri, SQLite-backed session store, multi-provider via OpenAI-compatible protocol, static tool registry for ES/OpenSearch/DynamoDB). The two systems converge on the same robustness primitives but diverge sharply on architecture, extensibility, and runtime model.

---

## Architecture at a Glance

| Aspect | OpenCode | DocKit |
|---|---|---|
| **Runtime** | Bun (TypeScript) — single-process server/TUI | Tauri v2 — Vue frontend + Rust backend, IPC over Tauri commands |
| **Where the loop lives** | Backend (`session/prompt.ts`) — server-driven | Frontend (`composables/useDataStudioAgent.ts`) — Vue-driven |
| **Where LLM calls happen** | Backend (`session/llm.ts`, AI SDK) | Backend (`src-tauri/src/agent/harness.rs`, async-openai crate) |
| **Where tools execute** | Backend (`tool/registry.ts`, in-process) | Backend (`src-tauri/src/agent/executor.rs`, Tauri command) |
| **Persistence** | SQLite via Drizzle (`session.sql.ts`) | SQLite via rusqlite (`src-tauri/src/db/`, `agent/session_store.rs`) + Pinia for UI state |
| **Provider model** | Multi-provider via `BundledSDK` registry | Multi-provider via OpenAI-compatible protocol (OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio) |
| **Tool model** | Plugin-extensible (built-in + plugin + config-discovered) | Static, hard-coded for ES + DynamoDB |
| **Streaming transport** | AI SDK `streamText` → in-process iterator | Tauri events (`agent-delta`, `agent-tool-call`, `agent-step-done`) → frontend listener |

---

## 1. Agent Loop & Execution Model

### OpenCode

- **Location**: `packages/opencode/src/session/prompt.ts` — function `runLoop` inside `SessionPrompt`.
- **Shape**: `let step = 0; while (true) { ... step++ }` — open-ended loop guarded by `MAX_STEPS` and explicit exit conditions (no more assistant content, no tool calls, error, deny).
- **Driver**: **Backend-driven**. The loop owns the conversation; the TUI/CLI/UI is a consumer of streamed events.
- **LLM invocation**: `LLM.stream(...)` produces an in-process async iterable of model deltas; the prompt machinery consumes the `fullStream` and dispatches tool calls inline.
- **Tool dispatch**: Tools are bundled into the AI SDK call via `resolveTools` (a map of `id → Tool.Def`). The AI SDK's tool-calling protocol routes calls back into the loop's `execute(...)` callback automatically — no manual parsing.
- **Termination**: `MAX_STEPS`, `finishReason`, `ContextOverflowError`, deny policy (`experimental.continue_loop_on_deny`).
- **Concept of turns**: Yes, explicit. `LoopInput.resume_existing` allows resuming a session mid-conversation.

### DocKit

- **Location**: `src/composables/useDataStudioAgent.ts` — function `runAgentLoop` (lines 245–412).
- **Shape**: `for (let i = 0; i < maxIterations; i++)` — bounded loop with hard iteration cap (default 10, configurable per session).
- **Driver**: **Frontend-driven**. The Vue composable owns the loop; Rust is a stateless executor of single steps and tool calls.
- **LLM invocation**: Frontend calls `agentApi.runAgentStep` (Tauri command) → Rust `run_agent_step` in `harness.rs`. Rust streams deltas back to the frontend via Tauri events (`agent-delta`, `agent-tool-call`, `agent-step-done`).
- **Persistence**: Sessions stored in SQLite via rusqlite (`session_store.rs`). UI state (active session, tool confirmation) in Pinia.
- **Tool dispatch**: After each step, the frontend manually inspects `toolCalls`, applies confirmation rules, and either auto-executes (`executeToolCall`) or pauses the loop (`status: 'waiting_confirmation'`) until user approval.
- **Termination**: `finishReason` (`stop`/`length`/`content_filter`), `maxIterations`, doom-loop detection, errors.
- **Concept of turns**: Implicit — each user message starts a fresh loop invocation. No explicit `resume_existing` semantics; resumption is "best-effort" via Pinia hydration that resets in-flight statuses.

### Key Differences

| | OpenCode | DocKit |
|---|---|---|
| Loop owner | Backend service | Frontend composable |
| Loop shape | `while(true)` + step counter + max | Bounded `for` loop |
| Tool routing | AI SDK protocol (declarative) | Manual parse + dispatch |
| User confirmation | Permission system (config-driven) | Inline pause/resume via store status |
| IPC overhead | None (single-process) | Per-step Tauri call + event stream |

**Why the divergence**: OpenCode is built for autonomy — long-running coding sessions need a server-grade loop. DocKit's loop sits next to a Vue UI that needs synchronous reactivity to tool calls (confirmation modals, streaming markdown), so a frontend-driven loop is simpler than orchestrating Tauri events for every UI state change.

---

## 2. Tool System Architecture

### OpenCode

- **Definition**: `Tool.Def` interface — `{ id, parameters: ZodSchema, execute(args, ctx) }` validated via Zod.
- **Registry**: `packages/opencode/src/tool/registry.ts` — `ToolRegistry` loads:
  1. Built-ins (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `webfetch`, etc.)
  2. Plugin-provided tools (via `fromPlugin` adapter)
  3. Config-discovered custom tools
- **Result envelope**: `{ title, output, metadata: { truncated, outputPath }, attachments }`.
- **Truncation**: `tool/truncate.ts` — `MAX_LINES = 2000`, `MAX_BYTES = 50 * 1024`. Truncated outputs are persisted to disk and a `outputPath` reference is sent to the LLM.
- **Permissions**: Per-agent `Permission` defaults merged with user config; `doom_loop: "deny"` is a default rule. Tools filtered per agent.
- **LLM exposure**: Tools passed to AI SDK's `streamText({ tools })` — provider-agnostic.

### DocKit

- **Definition**: Hard-coded JSON Schema in `src-tauri/src/agent/tools.rs` — `all_tools()` returns a static array of OpenAI-compatible function definitions.
- **Registry**: None. The tool list is a constant. Each tool has a `risk_level` enum: `safe | elevated | destructive`.
- **Available tools** (12 total):
  - **ES**: `es.search`, `es.get_document`, `es.index_document`, `es.update_document`, `es.delete_document`, `es.delete_by_query`, `es.cat_indices`, `es.get_mapping`
  - **DynamoDB**: `dynamo.execute_query`, `dynamo.execute_write`, `dynamo.execute_delete`, `dynamo.describe_table`
- **Result envelope**: Plain JSON string, truncated to 8 KB.
- **Truncation**: `executor.rs` — `TOOL_OUTPUT_MAX_BYTES = 8 * 1024`. No disk persistence for full output; truncation is final.
- **Permissions**: Risk-based gating in frontend (`useDataStudioAgent.ts` lines 188–202). User-configurable rules per (connection, tool) stored in Pinia. Confirmation UX via `tool-confirmation-card.vue`.
- **LLM exposure**: Tools serialized into OpenAI `tools` param in `harness.rs`.

### Key Differences

| | OpenCode | DocKit |
|---|---|---|
| Extensibility | Plugin system + config discovery | Closed set, recompile to add |
| Schema | Zod (TS-native, runtime-validated) | Static JSON Schema in Rust |
| Truncation cap | 50 KB + disk fallback | 8 KB hard cap, no fallback |
| Permission model | Per-agent capability config | Per-tool risk + per-(connection,tool) rules |
| Result shape | Rich envelope (title/metadata/attachments) | Plain string |

**Why**: OpenCode targets unknown future tools; DocKit's tools are bounded by the database protocols it speaks. The 8 KB cap in DocKit is more aggressive because (a) database query results are the dominant tool output and easily blow past LLM context, (b) there's no disk-fallback UX in an embedded app.

---

## 3. Session & State Management

### OpenCode

- **Storage**: SQLite via Drizzle ORM (`session/session.sql.ts`).
- **Models**:
  - `Session` (with `Info` shape, `fromRow`/`toRow` mappers in `session/session.ts`)
  - `MessageV2` with `WithParts` — assistant messages contain typed `Part`s (`TextPart`, `ToolPart`, `ReasoningPart`, etc.)
  - Per-session lineage including `fork()` for branching conversations
- **Persistence model**: Server owns the DB; sessions are addressable by ID and survive process restarts trivially.
- **Resumption**: First-class via `LoopInput.resume_existing`. The loop reattaches and continues mid-stream.
- **Multi-session**: Native — sessions form a tree (parent/child via fork).
- **Branching**: `Session.fork(sessionId)` deep-copies messages and parts to a new session ID.

### DocKit

- **Storage**: SQLite via rusqlite (`src-tauri/src/db/`, `agent/session_store.rs`) — durable, survives app restarts.
- **Models**:
  ```ts
  type AgentSession = {
    id: string;
    connectionId: number;
    messages: AgentMessage[];
    status: 'idle' | 'running' | 'streaming' | 'waiting_confirmation' | 'error';
    schema?: string;
    maxIterations: number;
  };
  type AgentMessage = { role: 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ...; status?: ... };
  ```
- **Persistence model**: Rust SQLite backend owns session/message CRUD. Pinia caches sessions in-memory for Vue reactivity; `afterHydrate` resets in-flight statuses on restart.
- **Resumption**: **Soft** — a session reopens but the in-flight LLM/tool call is lost. The user must re-send the last message.
- **Multi-session**: Multiple sessions per connection, `activeSessionId` tracks current.
- **Branching**: None.

### Key Differences

| | OpenCode | DocKit |
|---|---|---|
| Backend | SQLite (durable, queryable) | SQLite via rusqlite (durable) |
| Resumption | True mid-stream resume | Status reset; user re-prompts |
| Branching | `fork()` for alternate timelines | None |
| Scale ceiling | Bounded by disk | Bounded by disk |
| Schema migration | Drizzle migrations | SQL migrations in `src-tauri/src/db/` |

**Why**: OpenCode runs as a daemon for long sessions across days; persistence is mission-critical. DocKit uses rusqlite for durable session storage. In-flight tool calls are still lost on crash (the loop lives in the frontend composable), but message history is preserved and the user can resume from context.

---

## 4. Provider / LLM Abstraction

### OpenCode

- **Abstraction layer**: `packages/opencode/src/provider/provider.ts` — `BundledSDK` type wraps any AI SDK provider behind a common `languageModel(modelId): LanguageModelV3` interface.
- **Supported providers**: OpenAI, Anthropic, Azure, Google Vertex, AWS Bedrock, GitLab AI, plus dynamically-loaded community providers.
- **Provider quirks**:
  - `wrapSSE` normalizes SSE streaming across providers
  - Per-provider headers, base URLs, region handling encapsulated in BundledSDK loaders
  - `wrapLanguageModel` applies cross-cutting transforms (e.g., reasoning extraction)
- **Foundation**: Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/anthropic`, etc.) — not LangChain.
- **Tool call format normalization**: AI SDK handles per-provider tool-call envelope differences automatically.

### DocKit

- **Abstraction layer**: None as a separate module. Provider selection is a small enum match in `harness.rs` (lines 18–30):
  ```rust
  match kind {
    Provider::OpenAi => "https://api.openai.com/v1",
    Provider::DeepSeek => "https://api.deepseek.com/v1",
    Provider::OpenRouter => "https://openrouter.ai/api/v1",
    Provider::Ollama => "http://localhost:11434/v1",
  }
  ```
- **Supported providers**: Anything OpenAI-compatible. **Single protocol, multiple endpoints** — OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio. Anthropic/Bedrock/Vertex would require new code paths.
- **Provider quirks**: None handled — relies on OpenAI compatibility of all endpoints.
- **Foundation**: `async-openai` Rust crate.
- **Configuration**: Per-feature model config (`getFeatureModelConfig` in `chatStore`) — `{ apiKey, baseUrl, httpProxy }` passed per-call.
- **Proxy support**: Per-profile via reqwest client builder.

### Key Differences

| | OpenCode | DocKit |
|---|---|---|
| Protocol surface | Multi-protocol (OpenAI, Anthropic, Bedrock SigV4, Vertex auth) | OpenAI-compatible only |
| Abstraction layer | First-class (`BundledSDK`, `LanguageModelV3`) | Inline match statement |
| Tool call formats | Normalized by AI SDK | Assumes OpenAI format |
| Proxy | Provider-level | Per-profile (per LLM call) |
| Dependency footprint | One SDK package per provider | Single Rust crate |

**Why**: OpenCode targets pro users with provider preferences and need for Claude/Gemini-grade reasoning. DocKit's "OpenAI-only" decision is a pragmatic simplicity choice — OpenAI-compatible has become the *de facto* lowest-common-denominator protocol, and most local/proxy stacks (Ollama, LiteLLM, OpenRouter) speak it natively.

**Trade-off DocKit accepts**: Cannot use Anthropic's native tool-use protocol or extended reasoning. Acceptable for now; documented constraint.

---

## 5. Robustness Features (Direct Parity Check)

| Feature | OpenCode | DocKit | Verdict |
|---|---|---|---|
| **Tool output truncation** | `tool/truncate.ts`: `MAX_LINES=2000`, `MAX_BYTES=50KB`, **+ disk fallback** with `outputPath` reference | `executor.rs`: `TOOL_OUTPUT_MAX_BYTES=8KB`, **hard cap, no fallback** | OpenCode richer; DocKit stricter |
| **Retry logic** | `session/retry.ts`: `retryable(error)` filters non-retryable errors; **explicitly skips ContextOverflowError**; honors provider `isRetryable` flag | `useDataStudioAgent.ts`: `RETRY_DELAYS_MS=[1s, 3s, 8s]`, regex match on 429/503/rate-limit | OpenCode smarter (provider-aware); DocKit simpler |
| **Doom-loop detection** | Permission-based: `doom_loop: "deny"` rule + `experimental.continue_loop_on_deny` toggle. **Detects via permission denials**, not call repetition. | `DOOM_LOOP_THRESHOLD=3`: detects **3 identical `(toolName, args)` calls in a row**, injects error, ends session | **Different mechanisms**. DocKit's is more direct repetition-detection; OpenCode's is policy-driven. |
| **Context overflow** | `ContextOverflowError` thrown; `session/compaction.ts` triggers **conversation compaction** (summarization of old messages) | `pruneMessagesForContext`: simple **token budget walk newest→oldest**, drops old messages until under `CONTEXT_TOKEN_LIMIT=100K` | OpenCode preserves info via summarization; DocKit drops info via pruning |
| **Max iterations** | `MAX_STEPS` constant in `prompt.ts` — **global** | `session.maxIterations` (default 10) — **per-session, configurable via `setSessionMaxIterations`** | DocKit more granular; OpenCode simpler |

### The Honest Score

DocKit now has **functional parity** with opencode on robustness, but the implementations differ in sophistication:

- ✅ **Truncation**: Both. OpenCode's disk fallback is nicer UX; DocKit's hard cap is fine for query results.
- ✅ **Retry**: Both. OpenCode reads provider error metadata (`isRetryable`); DocKit pattern-matches on error strings — slightly fragile but works for OpenAI-protocol errors.
- ✅ **Doom-loop**: Both, but **fundamentally different definitions**. OpenCode's is "user denied a tool 3 times → stop"; DocKit's is "model called the same tool with same args 3 times → stop". DocKit's is more useful for catching genuine LLM loops; OpenCode's is more useful for respecting user intent.
- ⚠️ **Context overflow**: DocKit prunes (lossy), OpenCode summarizes (lossy but information-preserving). **DocKit gap**: long sessions silently lose early context with no user signal. Consider adding a "conversation summarized" message or implementing summarization.
- ✅ **Max iterations**: DocKit's per-session config is actually **better** than opencode's global constant for a UI app (different query types want different budgets).

---

## Architectural Summary

### Where OpenCode Wins

1. **Extensibility** — plugin-based tools, multi-provider, fork-able sessions
2. **Persistence depth** — SQLite + true session resumption
3. **Provider abstraction** — `BundledSDK` cleanly handles cross-provider quirks
4. **Context preservation** — compaction/summarization beats pruning
5. **Single-process simplicity** — no IPC, no event bus

### Where DocKit Wins (or chooses appropriately)

1. **Domain fit** — static tool registry with risk levels matches a known query surface; no plugin system needed
2. **Permission UX** — per-(connection, tool) rule storage is a more granular UX than opencode's global config
3. **Per-session iteration limits** — better suited to UI workflow variability
4. **Doom-loop semantics** — repetition detection is the more useful definition for an embedded agent
5. **Tighter truncation** — 8 KB cap is appropriate for query results headed to a chat UI

### Fundamental Architectural Divergence

| Dimension | OpenCode | DocKit |
|---|---|---|
| **Position in stack** | Standalone agent platform | Embedded feature inside a domain app |
| **Loop ownership** | Backend service | Frontend composable |
| **Persistence philosophy** | Durable, queryable, fork-able | Soft, recoverable, in-memory-first |
| **Tool philosophy** | Open universe (plugins) | Closed universe (database protocols) |
| **Provider philosophy** | Multi-protocol abstraction | Single protocol, multiple endpoints |

---

## Recommended Next Steps for DocKit

If you want to close gaps:

1. **Context overflow**: Add a summarization step (a small LLM call to summarize pruned messages) to avoid silent information loss.
2. **Provider error metadata**: Parse OpenAI error responses for the `error.type` field (e.g., `insufficient_quota`, `rate_limit_exceeded`) instead of regex on error strings.
3. **Tool result envelope**: Consider extending tool results to `{ summary, fullResult, metadata }` so the UI can show "result truncated, click to view full" rather than dropping bytes silently.
4. **Session export/import**: A path toward shareable sessions.

---

## Bottom Line

DocKit is not trying to be opencode, and shouldn't. It's a focused embedded agent for NoSQL workflows. The recent robustness work brings it to **functional parity on the things that matter for stability**, while the architectural choices (frontend loop, OpenAI-only, static tools, Pinia persistence) are appropriate trade-offs for its scope.

The main forward-looking concerns are:

- **Context preservation under long conversations** — pruning silently drops info

Both addressable without a rewrite.

docs/public/db-opensearch