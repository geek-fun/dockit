# DocKit - AI Agent Guidelines

## ⚠️ Git: Never commit or push unless the user explicitly asks

- **Do NOT commit any change** unless the user says "commit", "push", "create a PR", or similar explicit instruction.
- Stack changes in the working tree. Batch related fixes together. Let the user decide when to commit.
- Multiple small commits on a PR create noise and make review harder.
- If you're unsure whether a change is commit-worthy, discuss it with the user first.

---

## Project Overview

DocKit is a Tauri v2 + Vue 3 + TypeScript desktop client for NoSQL databases (Elasticsearch, OpenSearch, DynamoDB).

**Tech Stack**: Tauri v2 (Rust backend), Vue 3 (Composition API), TypeScript, Monaco Editor, shadcn-vue + UnoCSS (styling).

**Key Directories**:

- `src/` - Vue frontend application
- `src-tauri/` - Rust backend (Tauri)
- `src/composables/` - Vue composables (reusable logic)
- `src/views/` - Page-level components
- `src/components/` - Shared UI components
- `src/components/ui/` - shadcn-vue components

---

## Coding/Architecture Guidelines

### Functional TypeScript

- Define functions as `const xxx = (...) => ...`. Prefer **functional decomposition** over OOP.
- **Avoid classes** unless strictly necessary.

### Declarative/Functional Collection Handling

- Replace `for`/`while` loops with `map`, `filter`, `find`, `some`, `every`, `reduce`, `flatMap` (and `sort` when appropriate).
- Favor pipeline-style transformations over step-by-step imperative logic.

### Immutability

- Avoid in-place mutation (`push`, `splice`, mutating objects/arrays, shared mutable state).
- Instead, return new arrays/objects and model changes as explicit state-transform functions (e.g., reducers).

### Pure Functions

- Keep functions small, composable, and side-effect-free where possible.
- If effects are required (I/O, logging), isolate them at the boundaries and keep core logic pure.

### Types

- Prefer `type`/`enum` over `interface` where possible.
- Use `type` when it can fully replace an `interface`.

### Module Boundaries

- Each module should export **only** via its `index.ts`.
- Avoid deep imports (e.g., import from `src/composables/useKeyboardShortcuts` → use `src/composables`).

### Export Discipline

- Only export functions/types/constants that are used outside the module.

### Provider-Agnostic Design

- Keep provider-agnostic abstractions and follow clean separation of concerns.

### Comments and Documentation

- Use as few inline comments as possible.
- Behavior should be clear from tests and naming.

---

## Styling Conventions

- **UnoCSS** for utility-first atomic CSS (loaded via `virtual:uno.css`)
- **shadcn-vue** for UI components (Radix Vue-based, headless)
- Theme tokens via CSS variables in `src/assets/styles/index.css`
- See `uno.config.ts` for UnoCSS presets and theme configuration

---

## Code Quality Tools

- **ESLint**: `npm run lint:check` (check violations), `npm run lint:fix` (auto-fix)
- **TypeScript**: Strict mode enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- **Prettier**: Single quotes, 100 char width, 2-space indent, semicolons, arrow parens `avoid`

---

## Build Commands

```bash
npm install        # Install dependencies
npm run tauri dev  # Compile and run (development)
npm run lint:check # Check ESLint violations
npm run lint:fix   # Auto-fix ESLint issues
npx tsc --noEmit   # TypeScript type check
```

---

## Shared Utilities — Impact Analysis Required

Modifying any of these requires the systemic impact analysis defined in the global AGENTS.md (Rule 5). Before changing, trace all call sites and verify no silent regressions.

### Rust (src-tauri/)

| Utility | Location | Callers | Failure Mode If Changed Carelessly |
|---|---|---|---|
| `create_http_client()` | `src/common/http_client.rs` | 10 callers across 7 files | A blanket timeout breaks streaming LLM responses, long ES queries, file downloads |
| `get_base_url()` | `src/agent/provider_adapter.rs` | `harness.rs`, `loop_runner.rs`, `config.rs` | Wrong base URL for any provider → all API calls fail |
| `build_headers()` | `src/agent/provider_adapter.rs` | `harness.rs`, `loop_runner.rs`, `config.rs` | Missing/wrong auth headers → all authenticated requests fail |
| `map_to_api_compatibility()` | `src/agent/provider_adapter.rs` | `harness.rs` | Wrong routing → wrong auth, wrong endpoint, wrong model parser |
| `resolve_spec()` | `src/agent/model_registry.rs` | `compact.rs`, `loop_runner.rs`, `conversation.rs` | Wrong context window → token budget miscalculation → premature compaction or overflow |

### TypeScript (src/)

| Utility | Location | Callers | Failure Mode If Changed Carelessly |
|---|---|---|---|
| `PROVIDER_PRESETS` | `src/store/appStore.ts` | `defaultProviderConfigs()`, `createProviderConfig()`, UI dropdown | Missing/wrong `apiCompatibility` → provider silently broken |
| `storeApi` | `src/datasources/storeApi.ts` | All Pinia stores | Save/load failure → settings lost on restart |
| `chatBotApi` | `src/datasources/chatBotApi.ts` | `aigc.vue`, `appStore.ts`, `chatStore.ts` | Wrong provider string → Tauri command maps to wrong API path |
| `saveChatSettings()` | `src/store/appStore.ts` | `aigc.vue` (setAutoCompact, etc.) | Chat settings not persisted or wrong defaults |

### Typical Caller Counts

When in doubt, grep the project for the symbol name. If a function has 3+ callers across 2+ files, apply the impact table rule. Rust utilities like `create_http_client` (10 callers) and TypeScript configs like `PROVIDER_PRESETS` (consumed by the entire provider pipeline) are the highest-risk categories.

---

## Pipeline Tracing — Required Before Any Bug Fix

Before implementing any fix, trace the FULL pipeline end-to-end. Document each layer.

### Common Dockit Pipelines

| Issue Domain | Pipeline Layers (trace in order) |
|---|---|
| **LLM response rendering** | Rust `stream_chat` SSE parsing → Rust `insert_message` DB write → TS `hydrateMessage` → TS `agent-message-bubble.vue` rendering |
| **LLM request construction** | TS `buildSystemPrompt` → `useChatAgent` settings → Rust `build_llm_messages` → Rust `formatter.build_request` → HTTP |
| **Chat settings persistence** | `aigc.vue` setter → `appStore.saveChatSettings` → `storeApi.setSecret` → Tauri `.store.dat` → `fetchLlmSettings` load |
| **Provider validation** | `aigc.vue` test → `chatBotApi.validateConfig` → Rust `validate_llm_config` → HTTP request → response parsing |
| **URL construction** | `get_base_url()` → `normalize_base_url()` → `formatter.chat_path()` → `format!("{}{}")` final URL |
| **Proxy routing** | TS `proxyMode` → settings → Rust `create_http_client(proxy_mode, ...)` → `get_proxy()` → `reqwest::Proxy` |

### ChatPanel Scroll Behavior

The `ChatPanel` component (`src/components/chat-panel.vue`) implements a specific scroll contract that must be preserved:

| Scenario | Expected Behavior | Implementation |
|---|---|---|
| **Panel opens** | Scroll to bottom immediately | `onMounted`: `stickToBottom = true` + double `rAF` after `nextTick` → `scrollToLastMessage()` (Virtualizer `scrollToIndex` with `align: 'end'`) + 300ms `setTimeout` retry (catches Virtualizer layout settling) |
| **New message arrives** | Auto-scroll if user is near bottom | `watch(messages.length)` → `stickToBottom` guard → `nextTick` → rAF-based `scrollToBottomForce()` (DOM scroll) |
| **Content streaming** | Auto-scroll if user is near bottom | `watch(last message content)` → `stickToBottom` guard → rAF-batched `scrollToBottomBatched()` (DOM scroll) |
| **User scrolls up** | Freeze auto-scroll — stay where they are | `handleViewportScroll` listener sets `stickToBottom = false` when `scrollHeight - (scrollTop + clientHeight) > 32px` |
| **User scrolls back to bottom** | Resume auto-scrolling | Same listener sets `stickToBottom = true` when distance ≤ 32px |
| **User sends a message** | Force scroll to bottom, resume auto-scrolling | `handleSend` calls `forceScrollToBottom()` before emitting |
| **User clicks continue** | Force scroll to bottom, resume auto-scrolling | `handleContinue` calls `forceScrollToBottom()` before emitting |

**Key variables in the component:**
- `stickToBottom` (`Ref<boolean>`) — controls whether auto-scroll is active
- `STICKY_THRESHOLD_PX = 32` — how close to bottom counts as "at bottom"
- `scrollRafId` — rAF batching guard, prevents redundant scroll calls within one frame
- `virtualizerRef` — ref to virtua's Virtualizer component, exposes `scrollToIndex(index)` for reliable scroll-to-last-item (used in `scrollToLastMessage` and `forceScrollToBottom`)

**When modifying this behavior:**
- Never remove the scroll event listener (`'scroll'` on viewport element) — it's the only mechanism that detects user scroll-up
- Never remove the `stickToBottom` guard in `scrollToBottomForce()` and `scrollToBottomBatched()` — without it, the panel would jump to bottom while user is reading history
- Always call `forceScrollToBottom()` before `emit('send', ...)` in send/continue handlers — this ensures the user's action overrides any scroll-up state
- `forceScrollToBottom()` and `onMounted` use `scrollToLastMessage()` (Virtualizer `scrollToIndex` API) for scroll-to-bottom — do NOT revert to DOM `scrollTop = scrollHeight` for mount/force-scroll. The Virtualizer computes `scrollHeight` asynchronously and DOM scroll is unreliable before item sizes are measured.
- Streaming scrolls (`scrollToBottomForce`, `scrollToBottomBatched`) use DOM `scrollTop = scrollHeight` — this works during streaming because virtua has already rendered the items and updates `scrollHeight` incrementally

### Known Failure Modes (from real bugs)

| Failure | How to prevent |
|---|---|
| **Double `/v1/` in URL** | When adding a new API path to `chat_path()`, verify it's consistent with `get_base_url()` which already appends `/v1`. Trace: `get_base_url` → `chat_path` → URL assembly. |
| **System messages rejected by Anthropic** | When sending messages to Anthropic via `build_request`, system-role messages MUST go in the top-level `system` field, not the `messages` array. The `AnthropicChatFormatter.build_request` handles this internally. |
| **Duplicate function declarations** | Before adding any function, grep the file for its name. Vue SFCs often have declarations you might not see on a quick scan. |
| **Accidental i18n key deletion** | When removing adjacent lines in i18n files, always grep for remaining references to ALL keys in the deleted block. One edit can silently remove 2+ keys. |
| **Quick UI additions when infrastructure exists** | Before adding a new indicator/label/component, search for existing infrastructure: check `agent-message-bubble.vue`, `context-indicator.vue`, `useChatAgent.ts` phase setters. The "Preparing..." indicator already exists — just needs scroll. |
| **Proxy ignored in agent loop** | `loop_runner.rs` and `compact.rs` read `proxyMode` from settings. When touching proxy code, verify both paths AND all 10 `create_http_client` call sites. |
| **ChatPanel scroll broken by refactor** | When modifying `chat-panel.vue`, always preserve the scroll contract table above. Common mistakes: removing the scroll event listener, removing `stickToBottom` guard, or removing `forceScrollToBottom()` before `emit('send')`. |
