# Data Studio — Product Requirements Document

**Status:** Draft v1.0
**Last updated:** 2026-04-18
**Owner:** geek-fun
**Companion docs:** [Strategic Research Report (Issue #1)](https://github.com/geek-fun/dockit-ultimate/issues/1)

---

## 0. TL;DR

**Data Studio is a shared, embeddable AI data agent layer that ships inside DocKit (NoSQL GUI) and SQLKit (SQL GUI).** It is not a new desktop app. It is a Rust + TypeScript module that turns either host product into an agentic database client: natural-language Q&A over the user's data, autonomous multi-step investigations, and a self-improving skill library — all running **local-first** with the user's own model API keys.

The product is differentiated on three engineering pillars:

1. **Harness Engineering** — a robust agent runtime: deterministic tool-call loop, sandboxed execution, tiered autonomy, security guard with per-action confirmation memory, cost/latency budgets, and replayable traces.
2. **Hermes-style Self-Improvement** — persistent memory and **auto-generated skills**: the agent distills successful query patterns, schema understanding, and workflows into reusable skills that make it more capable the longer it runs. Inspired by [Nous Research's Hermes Agent](https://hermes-agent.nousresearch.com/).
3. **Layered Memory** — five coordinated memory tiers (session, long-term, schema, semantic, episodic) backed by a local SQLite + vector store, with optional team sync.

Positioning vs. Chat2DB / DataGrip / DBeaver: they are **chat-augmented editors**. Data Studio is an **agent that does the work**, with the editor as a fallback surface.

---

## 1. Background & Strategic Context

### 1.1 Why now

The strategic research in Issue #1 establishes the market opportunity: AI-native database tooling is the fastest-growing segment of a ~$175B database software market, with NL2SQL becoming table stakes. Current incumbents bolt chat onto a SQL editor; none of them ship a true **agent** with memory, skill acquisition, and autonomy controls.

### 1.2 Product family

| Product       | Scope                                  | Status                |
| ------------- | -------------------------------------- | --------------------- |
| **DocKit**    | NoSQL desktop GUI (ES, OpenSearch, DynamoDB) | Shipping (free + Ultimate) |
| **SQLKit**    | SQL desktop GUI (PostgreSQL, MySQL, SQLite, …) | Shipping / planned (free + Ultimate) |
| **Data Studio** | **AI data-agent layer embedded in both** | This PRD              |

Data Studio is **not** a standalone app, and is **not** a replacement for either host. It is the agent surface and runtime that both apps mount. The host owns: connection management, raw editor, results grid, theming. Data Studio owns: chat surface, agent runtime, memory, skills, tool registry, security guard.

### 1.3 Licensing model

**Data Studio (agent + chat assistant) is exclusively available to Ultimate-tier purchasers.** Free-tier users of DocKit and SQLKit do not see or have access to the agent surface. The host app gates the mount point: unless the user holds a valid Ultimate license, `DataStudio.mount()` is never called and the UI slot remains collapsed.

Implications:

- **No freemium agent.** The agent is the premium differentiator, not a growth hook. Conversion comes from the host app's free-tier value pulling users in, and the agent being compelling enough to justify the upgrade.
- **BYOK is additive, not the pricing axis.** Ultimate users bring their own model API keys. The license unlocks the harness, memory, skills, and chat surface. The model cost is on the user.
- **Skill Marketplace and Team Memory (Phase 3+)** may introduce additional pricing tiers or add-ons on top of Ultimate, but the base agent + chat is covered by the Ultimate license.

### 1.3 Non-goals

- **Not** a BI/dashboarding product (no scheduled emails, no chart authoring beyond inline result viz). Dashboards may come in a later host-level effort.
- **Not** a cloud SaaS. There is no required backend service for v1.
- **Not** a model provider. We integrate with user-supplied LLM endpoints (BYOK).
- **Not** a free feature. Agent and chat assistant are Ultimate-only. Free-tier users have no access to any Data Studio surface.
- **Not** a replacement for the raw query editor. Power users keep the editor; the agent augments it.

---

## 2. Users, Personas & Jobs to be Done

Personas are inherited from Issue #1. The PRD groups them by their **dominant interaction mode** with the agent, because that — not job title — drives feature requirements.

| Mode        | Personas                  | Dominant JTBD                                                  |
| ----------- | ------------------------- | -------------------------------------------------------------- |
| **Drive**   | Dev Dave, Enterprise Eric | "Help me write/debug/optimize a query I already conceived."   |
| **Ask**     | Analyst Amy, Startup Sarah | "Answer my question; I don't care what query you run."         |
| **Delegate**| Business Ben              | "Investigate this and come back with a finding."               |

The agent UI must collapse gracefully across all three modes. The same chat input drives all of them; the difference is autonomy level and output format.

### 2.1 Core JTBDs (v1)

1. **Translate intent → executable query** with schema awareness, on the user's actual database.
2. **Investigate open-ended questions** by chaining read queries and reasoning over results.
3. **Explain & document** existing queries, schema, and result anomalies.
4. **Safely perform writes** (INSERT/UPDATE/DELETE/DDL) with explicit, memorable consent.
5. **Get smarter over time** at the user's specific schema, business terms, and workflows.

---

## 3. Product Principles

1. **Local-first, BYOK.** No data, schema, or query ever leaves the device except in calls the user explicitly authorized to their chosen model provider. This is a hard constraint, not a default.
2. **Agency is opt-in and per-action.** The user chooses how much autonomy to grant; the harness enforces it. The default is conservative (read-auto, write-confirm).
3. **The agent is observable.** Every tool call, every prompt, every memory write is inspectable and replayable. No black boxes.
4. **The agent gets better with use.** Successful patterns become persistent skills. The product on day 30 is meaningfully more capable than day 1, for that user, on that schema.
5. **The host owns the chrome.** Data Studio renders into a slot the host provides. It does not impose theme, navigation, or window behavior.
6. **Functional, immutable, typed.** Per `AGENTS.md`: no classes unless required, no `as any`, declarative collection handling, module exports via `index.ts`.

---

## 4. Architecture Overview

### 4.1 Layered view

```
┌─────────────────────────────────────────────────────────────────────┐
│  Host App  (DocKit  |  SQLKit)                                      │
│  Connections · Editor · Results Grid · Theme · Window               │
├─────────────────────────────────────────────────────────────────────┤
│  Data Studio UI  (Vue 3 + TS, mounted into host slot)              │
│  Chat surface · Trace viewer · Skill manager · Settings             │
├─────────────────────────────────────────────────────────────────────┤
│  Harness  (Rust, in-process via Tauri commands)                    │
│  Agent loop · Tool registry · Security guard · Budget enforcer      │
│  Sandboxed sub-agents · Streaming bus · Trace recorder              │
├──────────┬──────────────┬────────────────┬──────────────────────────┤
│ Hermes   │   Memory     │  Tool Plane    │   Model Plane            │
│ Self-    │  ┌─────────┐ │  ┌──────────┐  │  ┌────────────────────┐  │
│ Improve  │  │Session  │ │  │SQL tools │  │  │OpenAI / Anthropic  │  │
│ ┌──────┐ │  │Long-term│ │  │NoSQL tool│  │  │Google / xAI        │  │
│ │Skill │ │  │Schema   │ │  │MCP tools │  │  │Ollama / llama.cpp  │  │
│ │Forge │ │  │Semantic │ │  │File/HTTP │  │  │OpenAI-compat       │  │
│ │Eval  │ │  │Episodic │ │  │Sub-agent │  │  └────────────────────┘  │
│ └──────┘ │  └─────────┘ │  └──────────┘  │                          │
├──────────┴──────────────┴────────────────┴──────────────────────────┤
│  Storage  (per-user, on-device, per-host)                               │
│  .dockit/data-studio/ (DocKit) or .sqlkit/data-studio/ (SQLKit)         │
│  SQLite (relational, traces, memory)  ·  Local vector store             │
│  Encrypted keychain (API keys, DB credentials)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component ownership

| Layer            | Language | Where it runs           | Why                                    |
| ---------------- | -------- | ----------------------- | -------------------------------------- |
| Chat UI          | TS/Vue   | Tauri webview           | Inherits host UX stack                 |
| Harness core     | Rust     | Tauri main process      | Sandboxing, security, performance      |
| Tool execution   | Rust     | Tauri main process      | Already where DB drivers live          |
| Memory store     | Rust     | Tauri main process      | SQLite + vector ops, secrets isolation |
| Model API calls  | Rust     | Tauri main process      | Keys never touch the webview           |
| Skill definitions| Markdown + JSON | On disk under host data dir | Human-inspectable, diff-able, Apache-2.0 |

**Rationale for Rust harness:** keys, traces, and tool execution must be isolated from any HTML rendering surface. The webview is treated as untrusted relative to credentials.

### 4.3 Storage layout

Each host app owns its data directory. Data Studio nests under it:

```
.dockit/                          # DocKit's existing data root
  data-studio/
    db/
      memory.sqlite               # long-term, schema, episodic memory
      vectors/                    # semantic memory index (if configured)
    skills/
      built-in/                   # shipped with the product (Apache-2.0)
      user/                       # auto-generated or manually created (Apache-2.0, user-owned)
      team/                       # synced skills (Phase 3)
    traces/                       # overflow trace storage (large payloads)
    config.json                   # model routing, budgets, autonomy defaults

.sqlkit/                          # SQLKit's equivalent — identical inner layout
  data-studio/
    ...
```

No data is shared between hosts. A user with both DocKit and SQLKit gets independent agent state per app — different connections, different learned skills, different memory. Cross-host coordination (Phase 3) bridges them at runtime, not at storage.

### 4.3 Embedding contract (host ↔ Data Studio)

The host provides:

```ts
type DataStudioHost = {
  getActiveConnection: () => ConnectionHandle | null;
  executeQuery: (h: ConnectionHandle, q: Query) => Promise<QueryResult>;
  describeSchema: (h: ConnectionHandle) => Promise<SchemaSnapshot>;
  uiSlot: HTMLElement;     // where Data Studio renders
  theme: ThemeTokens;       // reactive theme tokens
};
```

Data Studio exposes:

```ts
type DataStudio = {
  mount: (host: DataStudioHost) => Unmount;
  openWith: (intent: string) => void;       // host can deep-link
  onWriteRequest: Listener<WriteRequest>;   // host can intercept for its own UI
};
```

This contract is the seam that lets one Rust + TS codebase serve both DocKit and SQLKit without either host knowing about the other.

---

## 5. Pillar 1 — Harness Engineering

The harness is the agent runtime: it owns the tool-call loop, enforces safety, manages budgets, and produces traces. It is the most safety-critical part of the product.

### 5.1 Agent loop

A single iteration:

```
plan → select tool → security guard check → (confirm?) → execute
     → stream result back to model → update memory → loop or finalize
```

Properties:

- **Deterministic shape.** The loop is a pure state machine in Rust. Every transition is logged.
- **Bounded.** Hard caps on iterations, wall-clock time, token spend, and cost (configurable per autonomy mode).
- **Streamable.** Every step emits events (`step.started`, `tool.called`, `tool.result`, `model.delta`, `step.finished`) consumed by the UI for live feedback.
- **Resumable.** A halted run (budget exhausted, user cancellation, crash) can be resumed from its last persisted step.
- **Forkable.** From any step in a trace, the user can edit and re-run — a debugger for agent runs.

### 5.2 Tool registry

Every capability the agent can use is a **tool** with an explicit, typed contract:

```ts
type Tool = {
  name: string;                    // e.g., "sql.execute_read"
  description: string;             // shown to the model
  inputSchema: JsonSchema;         // validated before execution
  outputSchema: JsonSchema;
  risk: "safe" | "elevated" | "destructive";
  costHint?: { latencyMs: number; tokens?: number };
  exec: (input, ctx) => Promise<Output>;
};
```

Built-in tool families (v1):

| Family         | Examples                                                     | Risk class                  |
| -------------- | ------------------------------------------------------------ | --------------------------- |
| `sql.*`        | `execute_read`, `execute_write`, `explain`, `dry_run`        | safe / destructive          |
| `nosql.es.*`   | `search`, `index_doc`, `delete_by_query`                     | safe / destructive          |
| `nosql.dynamo.*` | `query`, `scan`, `put_item`, `delete_item`                 | safe / destructive          |
| `schema.*`     | `describe`, `sample_rows`, `inspect_index`                   | safe                        |
| `memory.*`     | `recall`, `remember`, `forget`                               | elevated                    |
| `skill.*`      | `list`, `invoke`, `propose_new`                              | safe / elevated             |
| `subagent.*`   | `spawn`, `await`                                             | elevated                    |
| `mcp.*`        | dynamic — discovered from configured MCP servers             | per server policy           |
| `fs.workspace.*` | `read`, `write` (sandboxed to workspace dir)               | elevated                    |
| `http.*`       | `get` (allow-listed hosts only)                              | elevated                    |

The model never sees tools that are not relevant to the active connection (e.g., DynamoDB tools are hidden from a Postgres session).

### 5.3 Security guard (the confirmation engine)

This is the user-visible safety mechanism. It implements the autonomy semantics requested for v1.

**Autonomy modes** (user-selectable, per-connection, persisted):

1. **Manual** — agent proposes; user clicks Run for every tool call.
2. **Default Access** *(default for new connections)* — read-class tools auto-execute; elevated/destructive tools require confirmation.
3. **Full Access** — all tools auto-execute, subject to budgets and the kill switch.

**Confirmation memory ("don't ask me again, for this action").** When the guard prompts for confirmation it offers four choices:

| Choice            | Effect                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- |
| Allow once        | Run this single call.                                                                  |
| Allow always      | Add a permission rule keyed by `(connection, tool, redacted-arg-shape)`.               |
| Deny once         | Skip this call; agent receives a tool error and continues.                             |
| Deny always       | Add a deny rule with the same key shape.                                               |

Permission rules are persisted in the user's local store, surfaced in Settings → Permissions, and individually revocable. The rule key uses a **structural fingerprint** (table/index name, op type) — not the raw values — so "DELETE from `users` table" is one rule, regardless of which row is targeted. Pure value differences (e.g., a different `WHERE id = …`) do not bypass the rule.

**Always-confirm regardless of mode:**

- Multi-row writes without a `WHERE` / equivalent constraint
- DDL (`DROP`, `TRUNCATE`, `ALTER`)
- Operations on tables/indexes flagged as production
- Anything tagged `risk: destructive` and lacking a matching allow-always rule

**Pre-execution checks for write tools:**

- Static analysis: detect missing `WHERE`, full-index deletes, type mismatches.
- `EXPLAIN` / dry-run: where supported, run the explain plan and surface estimated impact (rows affected) in the confirmation dialog.
- **Snapshot-before-write** when the connection driver supports it (transactional rollback for SQL; soft-delete index for ES). Failed or regretted writes can be undone from the trace viewer.

**Kill switch.** A persistent floating Stop button cancels the current run, flushes pending tool calls, and asks the model for a final summary of what completed.

### 5.4 Budgets

Per run and per session caps, configurable per autonomy mode:

- Wall-clock seconds
- Total tokens (in + out)
- Estimated USD cost (computed from provider rate card)
- Tool-call count
- Iterations

Budgets are surfaced in the chat header as live meters. Exceeding any cap halts the run with a "continue?" prompt that shows what's been spent vs. remaining.

### 5.5 Sandboxing & sub-agents

Long, branching investigations spawn **sub-agents** with their own isolated context:

- Separate conversation, memory window, and budget.
- Read-only access to memory unless explicitly granted write.
- No nested sub-agent spawning beyond depth 2 in v1 (prevents runaway fan-out).
- Sub-agent output is summarized into the parent context — the parent does not pay for the sub-agent's full transcript.

This mirrors the Hermes "delegates & parallelizes" pattern but constrained for desktop use.

### 5.6 Trace recorder

Every run produces a trace stored in SQLite. A trace is the canonical artifact: chat text is a rendering of it, not the source of truth. Each trace contains:

- Full message history (model in/out)
- Every tool call: input, output, duration, cost, risk level, confirmation outcome
- Memory reads/writes
- Skills invoked
- Budget consumption per step
- Final status: `completed | halted | cancelled | errored`

Traces power: the inline UI, the debugger/forking workflow, eval datasets (Section 6.4), and audit export (Section 9).

---

## 6. Pillar 2 — Hermes-Style Self-Improvement

The agent must measurably improve at the user's specific schema and workflows over time. This is the pillar that differentiates Data Studio from any "chat + SQL editor" competitor. The model is inspired by Nous Research's Hermes Agent, adapted for an embedded desktop database context.

### 6.1 Skills — definition

A **skill** is a named, parameterized procedure the agent can invoke as a single tool. Skills are first-class artifacts living on disk under the host's `data-studio/skills/` directory (see Section 4.3).

**All skills — built-in and user-generated — are licensed Apache-2.0.** Users fully own their auto-generated skills and may redistribute, modify, or commercialize them.

```
.dockit/data-studio/skills/       # (or .sqlkit/data-studio/skills/)
  built-in/
    explain-slow-query.md
    safe-bulk-update.md
    schema-walk.md
  user/
    monthly-revenue-by-region.md
    detect-orphaned-orders.md
  team/  (optional, synced — Phase 3)
    company-glossary.md
```

Each skill file has YAML frontmatter (name, description, params schema, applicable connection types, success metrics) plus a Markdown body containing instructions, example queries, and pitfalls. Skills are diff-able, versioned, and exportable.

Skills come from three sources:

1. **Built-in** — shipped with the product (best practices, common patterns).
2. **User-authored** — written or imported by the user.
3. **Auto-generated** — distilled by the Skill Forge from successful traces.

### 6.2 Skill Forge — auto-generation pipeline

After a run completes successfully (user marks it useful, or implicit signals: result was exported, query was saved, no follow-up corrections within 24h), the Forge evaluates the trace for skill candidacy.

Candidacy criteria:

- Multi-step trace (≥ 3 tool calls) — single-shot queries don't need a skill.
- Pattern not already covered by an existing skill (semantic similarity check against the skill index).
- Generalizable parameters detectable (constants that look like inputs, e.g., dates, IDs, names).
- Reproducible (rerunning with abstracted parameters on a representative sample succeeds).

If a candidate passes, the Forge:

1. Drafts a skill (LLM call with a strict, versioned meta-prompt).
2. Generates 2–3 self-tests (small queries that should succeed against the same connection).
3. Runs the self-tests.
4. **Proposes** the skill to the user — never auto-installs without explicit consent in v1. (This may relax in v2 once trust is established.)

Users see new skill proposals in a dedicated inbox, with diff preview, the originating trace, and accept / edit / reject controls.

### 6.3 Skill execution

When the agent decides to use a skill, the harness:

- Validates parameters against the skill's schema.
- Injects the skill body into the model context as a high-priority instruction block.
- Runs the inner tool calls within the run's budget.
- Records skill invocation in the trace (skill name + version + outcome).

Skill outcomes feed back into ranking: skills that succeed are surfaced more readily; skills that consistently fail are flagged for review.

### 6.4 Eval harness (the "is it actually getting better?" loop)

Self-improvement claims are worthless without measurement. The product ships an internal eval harness:

- **Synthetic golden datasets** per connection type (synthetic schemas + question/answer pairs) ship built-in and are maintained by the team.
- **Community contributions**: users may opt in to submit anonymized trace-derived eval cases. These augment the synthetic datasets over time, improving coverage for real-world schema patterns and query idioms. Submissions are stripped of connection details, row values, and any user-identifiable content before inclusion.
- **Replay engine** that runs the current agent against past traces and compares outcomes (semantic equivalence of result sets, not byte equality).
- **Regression scoring** on every release, per skill, per model provider.
- Optional **user-opt-in** local evals: the user can mark "this answer was wrong" and the trace becomes a regression case used to validate future model/skill updates on their device.

No telemetry leaves the device unless the user explicitly opts into the Skill Marketplace or eval contribution flows.

### 6.5 Anti-patterns we explicitly avoid

- **Prompt-stuffing memory.** The agent does not have an ever-growing system prompt. Memory is retrieved on demand, scoped, and budgeted.
- **Implicit fine-tuning of user data.** No background training calls to providers. Self-improvement happens through skills and memory, not weight updates.
- **Skills that wrap a single LLM call.** A skill must compose multiple tool calls or encode non-trivial procedure; otherwise it's just a saved prompt.

---

## 7. Pillar 3 — Memory System

Five coordinated memory tiers, ranked by user priority:

| Tier         | Lifetime         | Storage                         | Used for                                            |
| ------------ | ---------------- | ------------------------------- | --------------------------------------------------- |
| **Session**  | Current chat     | In-memory + SQLite shadow       | Sliding window, auto-summarization                  |
| **Long-term**| Per user × connection | SQLite                     | Preferences, business glossary, name conventions    |
| **Schema**   | Per connection   | SQLite + cached snapshot        | Tables, columns, indexes, sample rows, FK graph     |
| **Episodic** | Per user         | SQLite (traces table)           | Replayable agent runs                               |
| **Semantic** | Per user         | Local vector store              | Retrieval over past queries, results, skills, docs  |

### 7.1 Session memory

- Sliding window with a token budget set per model.
- When the budget is approached, an inline summarizer compresses the oldest N turns into a single system note. The compressed turns remain accessible in the trace, but only the summary is sent to the model.
- The user sees a subtle indicator when summarization happens.

### 7.2 Long-term memory

- Key-value style facts plus free-form notes, scoped by `(user, connection)`.
- Two write paths:
  - **Explicit** — user pins a fact ("`customer_id` is always a UUID, never an integer").
  - **Implicit** — the agent proposes a memory write; the user confirms or edits before it persists. Default mode does not allow implicit writes without confirmation.
- Fully editable in a Memory panel. No hidden state.

### 7.3 Schema memory

- On connection, the agent indexes: tables/collections/indexes, columns/fields with types, primary/foreign keys, sample rows (configurable cap, default 5), row counts, and indexes/sort keys.
- Refresh policy: on demand, on schema-change detection (where the driver supports notifications), and on a configurable interval.
- Sensitive columns can be marked **redacted** — the agent sees the column exists and its type, but never sees sample values.
- Schema memory is the largest contributor to NL2Query accuracy and is therefore prioritized in retrieval.

### 7.4 Semantic memory

- **Requires user-configured embedding model.** No bundled default. If no embedding model is configured, semantic memory is disabled and the agent operates with the other four tiers only. The Memory panel shows a clear setup prompt.
- Supported providers: any embedding endpoint compatible with the configured model adapters (OpenAI `text-embedding-*`, Ollama embedding models, generic OAI-compat).
- Indexed corpora:
  - Saved queries (with their natural-language descriptions)
  - Successful trace summaries
  - Skill descriptions
  - User-imported documentation (e.g., a data dictionary PDF)
- Retrieval is hybrid (vector + keyword) and budgeted (top-K with a token cap on injected context).

### 7.5 Episodic memory

- Backed by the trace recorder (Section 5.6).
- Browsable timeline UI: filter by connection, outcome, skill used, cost.
- "Resume from here" and "fork from here" actions feed back into the harness.

### 7.6 Cross-tier coordination

Retrieval for any new agent step follows a fixed precedence:

1. Session (always present)
2. Schema (top relevant tables for the question)
3. Long-term (matching pinned facts)
4. Semantic (top-K retrieved snippets)
5. Episodic (only when explicitly invoked — too large for default context)

Each tier has a token budget; the assembled context is logged in the trace so the user can see exactly what the model received.

### 7.7 Forgetting & data hygiene

- **Forget this connection** wipes all memory tiers scoped to it.
- **Forget this fact** removes a single long-term entry.
- **Auto-expire** for episodic memory (default: 90 days, user-configurable, opt-out).
- **Export** (JSON) and **wipe-all** are one-click operations in Settings.

### 7.8 Team memory (deferred — Phase 3)

Optional sync of skills + long-term facts across a team. The transport layer is abstracted behind a `SyncTransport` trait/interface with two planned implementations:

1. **Self-hosted relay** — implemented in Phase 3. A lightweight relay server (open-source, Apache-2.0) that teams run on their own infrastructure.
2. **Cloud sync** — **not implemented**. The `SyncTransport` abstraction supports it architecturally, but no cloud service is built or operated. This seam exists for future extension or third-party contribution.

Architectural seams present in v1 (but inert): long-term memory entries carry a `scope: "user" | "team"` field; skill files have a `team/` directory; the `SyncTransport` trait is defined but has no active implementation.

---

## 8. Model Plane (BYOK)

### 8.1 Providers

v1 ships adapters for:

- OpenAI (Chat Completions + Responses API)
- Anthropic (Messages API)
- Google (Gemini)
- xAI (Grok)
- Ollama (local)
- llama.cpp via OpenAI-compatible server
- Generic OpenAI-compatible endpoint

Keys are entered once, stored in the OS keychain (via Tauri's secure storage), and never logged or transmitted to anywhere except the chosen provider.

### 8.2 Routing

Per-connection (and overridable per-run) the user picks:

- **Planner model** — used for the agent loop, tool selection, reasoning. Quality matters most.
- **Worker model** *(optional)* — cheaper/faster model for inner steps like summarization, schema description, skill proposal drafts.
- **Embedding model** — for semantic memory. User must configure this explicitly; no bundled default in v1.

Default profiles ("Quality", "Balanced", "Fast", "Local-only") preset sensible combinations so users do not need to choose three models on day one. The embedding model slot has no default — semantic memory is inert until the user configures one.

### 8.3 Local model considerations

- The harness detects models without tool-calling support and falls back to a JSON-mode prompt scheme.
- Smaller local models trigger reduced default budgets and a UI hint.
- Schema and semantic memory work fully offline; only the model call requires the chosen endpoint.

---

## 9. UX Surfaces

### 9.1 Where Data Studio lives in the host

A dedicated panel docked to the side of the host's editor area. The user can:

- Toggle between editor-only, chat-only, or split.
- Pin the panel to an external window (multi-monitor users).
- Invoke the agent from the editor via a hotkey on selected text ("explain this", "rewrite this").

### 9.2 Chat surface

Anatomy:

- **Composer** with intent type chips (Ask · Investigate · Write · Explain) — soft hints that pre-bias the planner; user can also just type freely.
- **Connection chip** — the active connection the agent is bound to. Switching here is explicit.
- **Mode chip** — Manual / Default / Full Access. Tapping shows what each means.
- **Live trace strip** — collapsible, shows current step, tool, budget meters.
- **Result blocks** — query + table + (optional) inline visualization. Every result includes a "Run again," "Open in editor," and "Save as skill candidate" affordance.
- **Confirmation cards** — full-width, blocking. Show: tool, parameters (with redaction options for sensitive values), risk level, EXPLAIN output if available, and the four-choice control from Section 5.3.

### 9.3 Trace viewer

A separate route accessible from any message. Shows the full ordered list of steps, expandable per step, with raw model I/O hidden behind a toggle. Supports:

- Fork from step N
- Replay with new inputs
- Export trace (JSON or Markdown)
- Submit as eval case (local)

### 9.4 Skill manager

- Browse built-in / user / team skills.
- Inbox for auto-generated proposals.
- Edit skills inline (Markdown editor with frontmatter validator).
- See per-skill stats: invocations, success rate, average cost.

### 9.5 Memory panel

- Tabs per tier (Long-term, Schema, Semantic, Episodic).
- Search and filter.
- Edit / pin / forget entries.
- Per-connection scoping is always visible.

### 9.6 Settings

- API keys (per provider, with test-connection button)
- Model routing profiles
- Autonomy mode (per connection, with quick global override)
- Permission rules (the persisted "always allow/deny" entries) with one-click revoke
- Budgets (per mode)
- Privacy: redacted columns/tables, telemetry (default: OFF)
- Data: export, wipe per connection, wipe all

### 9.7 Visual & motion direction

- Inherits the host's design tokens; Data Studio adds none of its own colors.
- Streaming responses use a cursor-style insertion, not progress bars.
- Confirmation dialogs are unmistakable: distinct elevation, slight scale-in, focus-trapped.
- Trace strip uses sparkline-style budget meters that thin to a hairline when idle.
- Avoids any "AI shimmer/gradient" cliché — the agent is a tool, not a personality.

(Detailed design exploration is out of scope for this PRD; see the design brief that should follow it.)

---

## 10. Functional Requirements (numbered)

### 10.1 Harness

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| H-1   | Agent loop is a deterministic state machine with bounded iterations and resumable steps.             | P0       |
| H-2   | All tool calls validate input/output against JSON schemas; schema violations halt the call.          | P0       |
| H-3   | Three autonomy modes (Manual / Default / Full) selectable per connection and persisted.              | P0       |
| H-4   | Confirmation dialog supports Allow once / Allow always / Deny once / Deny always.                    | P0       |
| H-5   | "Always" choices persist as structural rules keyed by (connection, tool, op-shape).                  | P0       |
| H-6   | Destructive operations always require confirmation unless a matching allow-always rule exists.       | P0       |
| H-7   | Multi-row writes without WHERE / DDL always require confirmation, regardless of mode or rules.       | P0       |
| H-8   | Pre-execution dry-run / EXPLAIN surfaces estimated impact in the confirmation dialog where supported. | P0       |
| H-9   | Snapshot-before-write enabled where the driver supports rollback; surfaced as an "Undo" affordance. | P1       |
| H-10  | Budgets (time, tokens, USD, tool-calls, iterations) configurable per mode and enforced.              | P0       |
| H-11  | Visible kill switch cancels current run gracefully with a final summary.                             | P0       |
| H-12  | Sub-agents inherit budget allotments from parent; max nesting depth = 2 in v1.                       | P1       |
| H-13  | Every run produces a complete, replayable trace stored locally.                                      | P0       |
| H-14  | Traces support fork-and-edit-from-step.                                                              | P1       |

### 10.2 Hermes / Self-improvement

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| S-1   | Skills are file-based (Markdown + YAML frontmatter), diffable, and exportable.                       | P0       |
| S-2   | Built-in skill library ships with at least 15 skills covering common patterns per database family.   | P0       |
| S-3   | Skill Forge proposes new skills from successful traces; never auto-installs without consent in v1.    | P0       |
| S-4   | Skill proposals include self-tests that pass before the proposal is shown to the user.               | P1       |
| S-5   | Skill execution is recorded in traces (name + version + outcome).                                    | P0       |
| S-6   | Eval harness runs regression suite on every release; results visible in About → Diagnostics.         | P1       |
| S-7   | User can mark a trace as a regression case used in local evals.                                      | P2       |

### 10.3 Memory

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| M-1   | Five tiers (Session / Long-term / Schema / Episodic / Semantic) implemented with documented APIs.    | P0       |
| M-2   | All memory writes are inspectable in the Memory panel; user can edit or forget any entry.            | P0       |
| M-3   | Schema memory auto-refreshes on demand and on detected schema change.                                | P0       |
| M-4   | Implicit long-term writes require confirmation (in default mode).                                    | P0       |
| M-5   | Sensitive columns/tables can be marked redacted; values never enter context.                         | P0       |
| M-6   | Per-tier token budgets are enforced; assembled context is recorded in the trace.                     | P1       |
| M-7   | One-click forget per connection; one-click wipe-all in settings.                                     | P0       |
| M-8   | Episodic memory auto-expires per user-configurable policy (default 90d).                             | P1       |

### 10.4 Model plane

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| MP-1  | Adapters for OpenAI, Anthropic, Google, xAI, Ollama, llama.cpp, generic OAI-compat.                  | P0       |
| MP-2  | API keys stored in OS keychain; never logged.                                                        | P0       |
| MP-3  | Per-connection planner / worker / embedding model selection with sane preset profiles.               | P0       |
| MP-4  | Graceful fallback for models without native tool calling (JSON mode prompt scheme).                  | P1       |

### 10.5 Host integration

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| HI-1  | Single embedding contract (Section 4.3) implemented identically by DocKit and SQLKit.                | P0       |
| HI-2  | Data Studio respects host theme tokens; ships no global styles of its own.                           | P0       |
| HI-3  | Host can deep-link to the agent with a pre-filled intent (`openWith`).                               | P1       |
| HI-4  | Editor selection → "Ask the agent about this" hotkey.                                                | P1       |
| HI-5  | Host gates Data Studio mount behind Ultimate license validation; free-tier never calls `mount()`.    | P0       |

### 10.6 Privacy & security

| ID    | Requirement                                                                                          | Priority |
| ----- | ---------------------------------------------------------------------------------------------------- | -------- |
| P-1   | No network traffic except: user-configured model providers, user-configured MCP servers, allow-listed HTTP tool calls. | P0       |
| P-2   | Telemetry off by default. If/when added, it is opt-in, documented, and aggregated.                   | P0       |
| P-3   | All on-device storage is per-user; multi-user OS scenarios isolate storage.                          | P0       |
| P-4   | Audit-log export (JSON) for traces, permission rules, and memory writes.                             | P1       |
| P-5   | Connection credentials never enter prompt context.                                                   | P0       |

---

## 11. Phased Roadmap

The PRD covers vision; this roadmap sequences delivery.

### Phase 0 — Foundations *(weeks 1–4)*

- Embedding contract specced and stubbed in DocKit.
- Rust harness skeleton with: tool registry, JSON-schema validation, autonomy modes, confirmation pipeline, trace recorder.
- SQLite memory store with Session + Long-term + Schema tiers.
- One model adapter (OpenAI) and one tool family (`sql.execute_read`) end-to-end.
- Goal: an agent can answer "show me the 5 newest users" against a Postgres connection with read-only autonomy.

### Phase 1 — MVP *(weeks 5–12)* — **public release target**

- All P0 requirements above.
- Tool families for: SQL (read+write), Elasticsearch / OpenSearch, DynamoDB, schema, memory, fs.workspace.
- Adapters: OpenAI, Anthropic, Ollama.
- Built-in skill library (≥15 skills).
- Skill Forge in proposal-only mode.
- Memory panel + trace viewer + skill manager UIs.
- Embedded in DocKit; SQLKit integration in lockstep when SQLKit ships its first compatible release.
- Internal eval harness (not user-facing yet).

### Phase 2 — Growth *(months 4–9)*

- Sub-agents and parallel investigations (H-12).
- Snapshot-before-write / Undo (H-9).
- All remaining P1s.
- Eval harness surfaced in Diagnostics; user-marked regression cases (S-6, S-7).
- Adapters: Google, xAI, llama.cpp, generic OAI-compat.
- MCP client: connect to user-configured MCP servers; their tools appear in the registry behind per-server allow lists.
- Editor-selection hotkeys (HI-4); deep-linking from host (HI-3).
- Auto-expire and richer memory hygiene (M-8).

### Phase 3 — Differentiation *(months 9–18)*

- **Skill Marketplace** — opt-in publishing of skills. All published skills are **author-signed** (cryptographic signature tied to the author's identity). The client verifies signatures before installation. Skills carry Apache-2.0 license, eval results, and version metadata. No curation gate in v1 of the marketplace; trust is signature-based.
- **Team memory** — optional sync layer via **self-hosted relay** (implemented). The architecture includes a transport abstraction that supports cloud sync, but **cloud sync is not implemented** — it exists as an extensibility seam for future or third-party contribution.
- **Community eval contributions** — opt-in anonymized trace submission pipeline. Submissions are sanitized (no connection details, no row values, no PII) and merged into the public eval dataset.
- **Scheduled agents** — natural-language cron for recurring investigations (Hermes-style).
- **MCP server mode** — Data Studio exposes its own tools as an MCP server so external agents (Claude Desktop, IDE agents) can drive the user's databases through the same harness/security guard.
- **Multi-host coordination** — one agent run can use both a DocKit (NoSQL) and SQLKit (SQL) connection simultaneously to answer cross-store questions.

### Phase 4 — Vision *(month 18+)*

- **Self-hosted enterprise mode** — deployable runtime for shared team use, with SSO/RBAC/audit, while preserving the local-first guarantees for individual workstations.
- **Custom skill compilation** — skills with measured value get distilled into smaller, faster prompt+tool pipelines, reducing planner-model dependency.
- **Cross-skill composition** — the agent recognizes opportunities to chain skills it already has, raising its effective capability without new training.
- **In-product evals for end users** — non-experts can run their own quality regressions when changing model providers.

---

## 12. Success Metrics

### 12.1 Activation (per user)

- **Time to first successful agent answer** ≤ 5 minutes from first launch (measured locally; reportable only via opt-in telemetry).
- **First skill auto-proposed** within first 7 days of regular use.

### 12.2 Engagement

- ≥ 60 % of agent runs in week 4 use at least one user-pinned long-term memory or auto-generated skill (the "growing with you" proof).
- Median agent runs per active day per user ≥ 3 by week 8.

### 12.3 Quality

- NL→Query accuracy ≥ 90 % on internal golden datasets per supported DB family at GA.
- Confirmation false-positive rate (user clicks Allow on flagged actions): ≥ 70 % — high enough to prove the guard is calibrated, not noise.
- Confirmation override rate (user clicks Deny after agent proposed): trending down release-over-release.

### 12.4 Trust & safety

- Zero P0 incidents of credentials or row-level data leaving the device outside user-authorized provider calls.
- 100 % of destructive operations have a recorded confirmation (manual or rule-backed) in the trace.

### 12.5 Business

- **Primary metric: Ultimate conversion rate.** Percentage of free-tier users who upgrade to Ultimate, measured against baseline conversion before Data Studio ships.
- **Secondary: retention lift.** 30/60/90-day retention of Ultimate users with ≥1 agent run per week vs. Ultimate users who don't use the agent.
- **Tertiary: willingness-to-renew.** Ultimate renewal rate segmented by agent usage frequency.
- Target: ≥ 15 % lift in Ultimate conversion within 6 months of GA, attributable to agent-related upgrade triggers (measured via in-app upgrade-prompt click-through from agent paywall).

---

## 13. Open Questions

These are flagged to be resolved before the corresponding phase begins.

| #   | Question                                                                                                       | Needed by | Status |
| --- | -------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| Q1  | ~~Exact storage location & file layout convention shared between DocKit and SQLKit (XDG vs. Tauri default).~~  | Phase 0   | **Resolved: no shared storage. DocKit uses `.dockit/`, SQLKit uses its own equivalent (e.g., `.sqlkit/`). Each host owns its data directory.** |
| Q2  | ~~Default embedding model — ship a small bundled one, or require the user to pick?~~                           | Phase 1   | **Resolved: user must configure. No bundled default.** |
| Q3  | ~~Pricing: is the agent itself a Pro feature in DocKit/SQLKit, or free with BYOK and Pro adds team/skill sync?~~ | Phase 1 | **Resolved: agent + chat is Ultimate-only.** |
| Q4  | ~~What's the licensing model for built-in skills and auto-generated skills (user-owned or product-owned)?~~    | Phase 2   | **Resolved: Apache-2.0. Both built-in and user-generated skills are Apache-2.0 licensed. Users fully own their auto-generated skills.** |
| Q5  | ~~Skill Marketplace trust model: signed by author? curated? rating-based?~~                                    | Phase 3   | **Resolved: author-signed. Published skills must be cryptographically signed by the author.** |
| Q6  | ~~Team memory sync transport: self-hosted relay only, or also a managed cloud option?~~                        | Phase 3   | **Resolved: architecture supports both (self-hosted relay + cloud), but only self-hosted relay is implemented. Cloud sync is an extensibility seam, not a deliverable.** |
| Q7  | ~~Eval datasets — synthetic only, or also seed with anonymized community contributions?~~                      | Phase 2   | **Resolved: both. Synthetic golden datasets ship built-in; opt-in anonymized community contributions augment them over time.** |

All open questions resolved.

---

## 14. Risks & Mitigations

| Risk                                                                    | Likelihood | Impact | Mitigation                                                                                                                         |
| ----------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Confirmation fatigue makes Default mode feel worse than chat-only tools | High       | High   | Strong defaults for Allow-always; structural rules (not per-row); EXPLAIN context in dialog so users can confirm fast and informed. |
| Auto-generated skills accumulate as junk                                 | High       | Medium | Strict candidacy criteria; required self-tests; success-rate tracking; one-click bulk cleanup in the Skill Manager.                 |
| Memory grows unbounded                                                   | Medium     | Medium | Per-tier budgets; episodic auto-expire; visible storage usage in Settings.                                                          |
| Local model users get poor agent performance and blame the product       | Medium     | Medium | Capability detection; clear UI degradation labels; reduced default budgets; documented "works well with X+ size" guidance.          |
| BYOK costs surprise users                                                | High       | High   | Live cost meter; per-run and per-day USD caps; pre-run estimate on long investigations.                                             |
| Two-host integration drifts                                              | Medium     | High   | Single Rust crate + single TS package; embedding contract has a conformance test suite both hosts must pass.                        |
| Schema introspection burns tokens on huge databases                      | High       | Medium | Lazy schema loading; relevance-ranked subset retrieval; user-flaggable "ignore these schemas".                                      |
| Trace storage grows without bound                                         | Medium     | Low    | Auto-expire policy; one-click prune; per-connection size meter.                                                                     |

---

## 15. Glossary

- **Agent loop** — the iterative plan→tool→observe cycle the harness runs.
- **Autonomy mode** — Manual / Default Access / Full Access; controls when confirmations fire.
- **BYOK** — Bring Your Own Key; the user supplies their model provider credentials.
- **Confirmation memory** — persistent allow/deny rules created from "always" choices in confirmation dialogs.
- **Episodic memory** — the store of past agent traces.
- **Harness** — the Rust runtime that executes the agent loop, enforces safety, and records traces.
- **Hermes-style** — referencing Nous Research's Hermes Agent design ethos: persistent memory, auto-generated skills, sub-agent delegation.
- **MCP** — Model Context Protocol; standard for exposing/consuming agent tools across processes.
- **Schema memory** — cached, structured knowledge of a connection's tables/indexes/columns.
- **Semantic memory** — local vector index over user artifacts (queries, skills, docs).
- **Session memory** — the in-context conversation window.
- **Skill** — a named, parameterized procedure the agent can invoke as one tool.
- **Skill Forge** — the pipeline that distills skills from successful traces.
- **Sub-agent** — a child agent run with its own context and budget, summarized back to the parent.
- **Trace** — the canonical, replayable record of an agent run.

---

*End of PRD.*
