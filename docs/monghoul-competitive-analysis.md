# Monghoul Competitive Analysis (Internal)

> **Internal reference only.** Do not link from public-facing issues, PRs, or README — copyright/IP-sensitive comparison. Use this doc to derive feature-parity tasks framed as generic best-practice in public artifacts.

**Subject:** [Monghoul](https://monghoul.com/) ([features](https://monghoul.com/features/), [GitHub: Kontsedal/monghoul-public](https://github.com/Kontsedal/monghoul-public)) — a MongoDB GUI launched in late 2025 / early 2026.

**Why it matters:** Monghoul is the **closest architectural peer** to DocKit in the MongoDB space — Tauri shell, Monaco editor, custom completion provider, native-feeling UX, MCP integration. Unlike Compass (Electron) or Studio 3T (Java), Monghoul ships from essentially the same stack we use, which makes its feature surface the most direct benchmark for what an ambitious solo-built Tauri + Monaco MongoDB GUI can deliver in 2026.

This document captures the full feature surface of Monghoul (as of June 2026 based on monghoul.com/features) and maps each capability to DocKit's existing code or planned issues. The output is a prioritized gap list folded into existing roadmap issues #408, #409, #410, plus a new cluster-monitor issue.

---

## 1. Architectural peer comparison

| Dimension | DocKit | Monghoul |
|---|---|---|
| Shell | Tauri v2 | Tauri |
| Installer size | small (Tauri) | ~33 MB |
| Editor | Monaco + custom completion (`src/common/monaco/mongodb/*`) | Monaco + custom completion |
| Backend driver | Rust `mongodb` crate (`src-tauri/src/mongo_client.rs`) | Bun sidecar + MongoDB Node driver |
| Frontend | Vue 3 + UnoCSS + shadcn-vue | React + TailwindCSS + react-query |
| License | Apache 2.0 (OSI) | Source-available, free + Pro $9/mo |
| Multi-DB | ES + OS + DynamoDB + MongoDB (planned) | MongoDB only |
| MCP server | Planned (v2.0 milestone) | 70+ tools shipped |

DocKit's strategic edge: **truly free, Apache 2.0, multi-database, open contributor model.** Monghoul's edge is **depth in a single engine.**

---

## 2. Full feature inventory (Monghoul → DocKit status)

Status legend: ✅ implemented · 🚧 in-progress / issue exists · ❌ missing · ➖ N/A or partial

### 2.1 Query Editor

| Monghoul capability | DocKit status | Code anchor |
|---|---|---|
| Monaco with custom language registration | ✅ | `src/common/monaco/mongodb/index.ts` (`registerMongodbLanguage`) |
| Operator + stage + accumulator completion | ✅ | `src/common/monaco/mongodb/completion.ts`, `keywords.ts` |
| Validation markers | ✅ | `src/common/monaco/mongodb/validation.ts` |
| Sample queries (`mongoSampleQueries`) | ✅ | `src/common/monaco/mongodb/state.ts` |
| **Pipeline-accumulated fields**: `$lookup` / `$group` / `$project` / `$addFields` / `$replaceRoot` / `$facet` outputs feed later-stage autocomplete | ❌ | (extend `completion.ts`; tracked in #409 update) |
| **Progressive nested field disclosure** (`address.` → show only child fields) | ❌ | (#410 update) |
| **Index-aware prioritization** in `$sort` / `$match` with `(indexed)` label | ❌ | (#410 update) |
| **Type-aware operator suggestions** (`$regex` for strings, `$size` for arrays, `$gt/$lt` for numbers/dates) | ❌ | (#410 update) |
| **Enum value suggestions** from schema sampling | ❌ | (#410 update; depends on schema sampling) |
| **`$expr` context switching** (query operators → aggregation expressions inside `$expr`) | ❌ | (#410 update) |
| **JavaScript sandbox** with injected helpers (`ObjectId`, `ISODate`, `id()` shorthand, `NumberLong/Int/Decimal`, `dayjs`, `luxon`, `faker`, `lodash`) | ❌ | (#410 update; requires both Monaco completions and Rust execution support) |
| **Multi-line scripts with explicit `return`** | ❌ | (#410 update; Rust execution model) |
| **Date helper popover** (calendar with range mode, timezone, presets, auto-generated `$gte/$lte` query) | 🚧 (#410 scopes date macros via `#` trigger — popover is additional) | (#410 update) |
| **Code formatting** (Prettier via Shift+Alt+F / Ctrl+S / format-on-create) | ❌ | (#410 update) |
| Run with Ctrl+Enter / Cmd+Enter, Stop button, elapsed timer | ➖ (basic run exists) | `src/views/editor/mongo-editor/index.vue` |

### 2.2 Result Viewer

| Monghoul capability | DocKit status | Code anchor |
|---|---|---|
| Table view (virtualized) | 🚧 (#408 scopes this; replaces JSON-only `display-editor.vue`) | (#408) |
| Tree view (hierarchical) | 🚧 (#408) | (#408) |
| Raw JSON view (Monaco read-only) | ✅ (current `display-editor.vue`) | `src/views/editor/es-editor/display-editor.vue` |
| **Explain view** (perf grade, plan tree, index suggestions with one-click create) | ❌ | (new — fold into #408 update) |
| **Chart view** (8 chart types, dual axis, date aggregation, PNG export) | ❌ | (new — fold into #408 update) |
| Visual write-result view | ➖ | — |
| Column pinning, sorting, resize, reorder, multi-select | 🚧 (#408 scopes resize/sort; reorder/pin to add) | (#408 update) |
| **Inline editing with type selector** (string/number/bool/date/ObjectId/null + auto-conversion) | 🚧 (#408 scopes inline edit; type selector to add) | (#408 update) |
| **Enum combobox** in inline edit (suggest schema values, allow custom) | ❌ | (#408 update; depends on schema sampling) |
| **Date picker** for date cells (calendar, time, timezone, presets) | ❌ | (#408 update) |
| **Auto-explain badge** on every result (IXSCAN green / COLLSCAN red pill with hover popover) | ❌ | (#408 update; also Rust support to run `explain()` post-query) |
| **Result cap with cursor pagination** (configurable max, Load 5K/10K/All when capped) | 🚧 (#408 scopes pagination) | (#408) |
| **Cross-page search with cell-level highlighting** (Ctrl+F) | ❌ | (#408 update) |
| **Hover preview** for nested Object/Array cells (400ms popover) | ❌ | (#408 update) |
| **Expand-in-place** below a row with breadcrumb path and editable leaves | 🚧 (#408 scopes expand-all; in-place expansion is new) | (#408 update) |
| **Document diff** (Monaco DiffEditor, select 2+ rows, swap button, label field) | ❌ | (#408 update) |
| Right-click context menu (Filter by Value, Unset Field, Clone, Copy Value/Key/Path) | 🚧 (#408 scopes edit/clone/delete; full context menu is additional) | (#408 update) |
| Fullscreen modes (Tab / Window) and resizable editor/result split | ➖ | — |

### 2.3 Aggregation Builder

| Monghoul capability | DocKit status | Code anchor |
|---|---|---|
| Visual stage list + Monaco per-stage editor | 🚧 (#409) | (#409) |
| Drag-and-drop reorder + move up/down buttons | 🚧 (#409 scopes drag) | (#409 update) |
| **Per-stage enable/disable, collapse, duplicate** | ❌ | (#409 update) |
| **Run to here** (preview through stage N) | 🚧 (#409 scopes per-stage preview) | (#409) |
| **Auto-preview mode** (re-runs ~2s after each edit) | ❌ | (#409 update) |
| **Server version gating** (disable stages requiring newer MongoDB; raw editor ungated) | ❌ | (#409 update) |
| **`$lookup` form helper** with From/LocalField/ForeignField/As dropdowns (ObjectId-prioritized) | ❌ | (#409 update) |
| **Quick-start templates** (Filter & Sort, Group & Count, Join Collections, Reshape Fields) | ❌ | (#409 update) |
| **Stage search** when 4+ stages (filter by operator/desc/body, dim non-matching) | ❌ | (#409 update) |
| **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z) up to 50 entries | ❌ | (#409 update) |
| **Bidirectional code sync** (visual builder ↔ raw aggregation code) | 🚧 (#409 scopes export-to-shell, not bidirectional) | (#409 update) |
| **Destructive stage protection** (`$out`, `$merge` warning + confirm on protected connections) | ❌ | (#409 update; tied to write protection) |
| **Per-tab persistence** of stages, operators, bodies, enabled flags, collapsed states | ❌ | (#409 update) |

### 2.4 Explain View (often co-located with Result Viewer)

| Monghoul capability | DocKit status |
|---|---|
| Performance grade badge (A–F) with execution time, docs returned/examined, scan efficiency | ❌ |
| Per-stage doc count and execution time for aggregation pipelines | ❌ |
| **Data flow funnel** (visual document-count shrinkage through stages) | ❌ |
| **Index suggestions following ESR rule** with one-click create | ❌ |
| COLLSCAN warnings, disk spill detection, optimization tips | ❌ |
| Auto-explain runs transparently after every query | ❌ |

Folded into **#408 update** as part of the result-panel view modes.

### 2.5 Connection Management

| Monghoul capability | DocKit status | Code anchor |
|---|---|---|
| Form-based + URI string editor with bidirectional sync | ➖ (form-only currently) | `src/views/connect/components/mongodb-connect-dialog.vue` |
| **8 auth methods**: No Auth, Username/Password, SCRAM-SHA-1/256, X.509, LDAP, Kerberos, AWS IAM | ➖ (partial) | `src-tauri/src/mongo_client.rs` (`MongoAuth` enum) |
| **SSL/TLS** with custom CA + client certs + allow-invalid for self-signed | ➖ | `mongo_client.rs` |
| **SSH tunneling** (password or key) with auto lifecycle | ❌ | — |
| Direct vs Replica Set selection with read preference | ➖ | `mongo_client.rs` |
| **Persistent pooled connections** with cancellable queries (`killOp`) | ➖ | `mongo_client.rs` |
| **Per-connection result auto-cap** (default 1,000; explicit `.limit()` bypasses) | ❌ | — |
| **Auto-explain toggle per connection** | ❌ | — |
| **Database/collection filtering** (ignore vs allow modes) | ❌ | — |
| **Write protection** (per-conn / per-db / per-coll regex detection of 25+ destructive ops with confirmation) | ❌ | (cross-cutting; benefits all DBs) |
| Connection color coding (12 presets + picker, propagated to tabs/sidebar) | ❌ | — |
| Connection health check before save with cancellation | ➖ | — |

These are mostly **not** Mongo-specific — they belong in a follow-on connectivity/security epic, not the existing Mongo issues. Capture as **future work**, not in #408–#410.

### 2.6 Schema Analysis

| Monghoul capability | DocKit status |
|---|---|
| Sample-based analysis ($sample, configurable size 100–10K) with cancellation | ❌ |
| Hierarchical field tree with type badges + occurrence % | ❌ |
| **Auto-trigger** when opening a tab for a collection without a schema | ❌ |
| **Auto-trigger for foreign collections** referenced in `$lookup.from` / `$graphLookup.from` / `$unionWith` / `$merge.into` / `$out` | ❌ |
| Automatic enum detection (configurable thresholds, manual edit) | ❌ |
| Schema banner prompt at bottom of editor with one-click "generate schema" | ❌ |
| Enum values drive autocomplete (`$in`, `$nin`, `$eq`, `$ne`, direct comparisons) | ❌ |
| Field search with auto-expanding parents | ❌ |
| Persistent cache, copy schema as JSON | ❌ |

Foundational dependency for many editor/result features. Capture as a **future issue** (suggested: "Module: MongoDB Schema Sampling & Enum Detection") since #336 (Data Explorer) closed without scoping this.

### 2.7 Cluster Monitoring

| Monghoul capability | DocKit status | Code anchor |
|---|---|---|
| 10 metric cards (connections, ops/sec, memory, WiredTiger cache, network, locks, cursors, replica set) | ❌ | `src/views/manage/components/mongo-cluster-state.vue` is basic |
| Sparkline trend charts (last 30 points) with hover tooltips | ❌ | — |
| Slow query analysis (duration filters, COLLSCAN badges, kill operation) | ❌ | — |
| Database profiler with collection ranking + export | ❌ | — |
| Configurable poll interval 1–60s | ❌ | — |
| Server info panel (version, uptime, storage engine, host, replica role) | ➖ | — |

**Create new issue** under #112 (proposed below).

### 2.8 MCP Server (AI Tools)

| Monghoul capability | DocKit status |
|---|---|
| 70+ MCP tools (connections, databases, queries, schemas, indexes, import/export, workspace control) | ❌ |
| Token authentication with regeneration | ❌ |
| Review mode (AI queries queued for manual approval) | ❌ |
| Access log (method, params, status, duration, timestamp) | ❌ |

Strategic alignment: DocKit's milestone `Epic/enpower AI capability` (label exists). Treat as separate epic, not folded into MongoDB issues. **Future epic.**

### 2.9 Import & Export

| Monghoul capability | DocKit status |
|---|---|
| Import: JSON / NDJSON / CSV/TSV / Excel with type inference | 🚧 (#408 scopes JSON/CSV) |
| Export: JSON (EJSON canonical/relaxed, array/NDJSON, gzip), CSV, Excel | 🚧 (#408 scopes JSON/CSV) |
| Write strategies: Insert / Upsert / Drop & Insert | 🚧 (#408 scopes Insert) |
| Cross-instance collection copy (with optional index replication) | ❌ |
| Database-level import/export (all collections at once) | ❌ |
| MongoDB filter for selective export | ❌ |
| Background processing with progress + cancellation | ❌ |

Partly covered by #408; remaining items are **future work** (cross-instance copy especially).

### 2.10 Index Management

| Monghoul capability | DocKit status |
|---|---|
| Create compound indexes with reorder, asc/desc, live preview | ❌ |
| Options: Unique / Sparse / Background / Partial filter / TTL | ❌ |
| Pre-fill from Explain View (ESR-rule index suggestions) | ❌ |
| `$indexStats` size + usage with color-coding | ❌ |
| Drop / rebuild individual indexes | ❌ |

**Future issue** (suggested: "Module: MongoDB Index Management UI").

### 2.11 Validation Rules

| Monghoul capability | DocKit status |
|---|---|
| Monaco JSON editor for validator expression | ❌ |
| `$jsonSchema` template insertion | ❌ |
| Validation level (off/moderate/strict) + action (error/warn) | ❌ |
| Sidebar tree node with level/action badges | ❌ |

**Future issue.**

### 2.12 Workspace / Tabs / Navigation

| Monghoul capability | DocKit status |
|---|---|
| Multi-tab + tab restore (Ctrl+Shift+T) | ➖ (multi-tab exists for ES; verify for Mongo) |
| Split panels (horizontal / vertical / nested) | ❌ |
| Detached floating windows with position persistence | ❌ |
| **Command palette (Ctrl+K)** fuzzy search across everything | ❌ |
| Sidebar folders (Connections / Pinned / Favorites) with drag | ❌ |
| Hover preview cards (connections / databases / collections / indexes / schema) | ❌ |

Cross-cutting (benefits ES/OS/DDB too). **Future cross-cutting epic** — do not load into Mongo issues.

### 2.13 Themes

| Monghoul capability | DocKit status |
|---|---|
| 10 built-in themes | ➖ (dark/light only) |
| Theme editor with 3-color seed → 40+ derived semantic tokens | ❌ |
| 21 MongoDB type-specific colors for badges | ❌ |
| Monaco theming with custom token rules | ➖ |
| Import/export themes as JSON | ❌ |

CSS variable foundation exists in `src/assets/styles/index.css`. **Future epic.**

### 2.14 Other notable features

- **Operation logs** (full audit trail with search, filters, diff mode) → future
- **Data generator** (100+ Faker providers, 16 categories, up to 100K docs) → future
- **Document diff** (Monaco DiffEditor) → folded into #408
- **Date helper popover** → folded into #410
- **Server version gating** → folded into #409
- **Validation rules editor** → future

---

## 3. Decision: what goes into existing roadmap vs future

### Folded into existing open issues

| Issue | Additions |
|---|---|
| **#408** Document Browser & Operations | Explain view mode · Chart view mode · Auto-explain badge on every result · Inline-edit type selector · Date picker for date cells · Enum combobox · Document diff (Monaco DiffEditor) · Cross-page search (Ctrl+F) with cell highlighting · Hover preview popover for nested cells · Expand-in-place with breadcrumb · Extended right-click context menu (Filter by Value, Unset Field, Copy Path) · Column pin/reorder |
| **#409** Aggregation Pipeline Builder | Pipeline-accumulated field autocomplete · `$lookup` form helper · Per-stage enable/disable/collapse/duplicate · Auto-preview mode · Server version gating · Quick-start templates · Stage search · Undo/redo · Bidirectional code sync · Destructive-stage protection · Per-tab persistence |
| **#410** Editor Productivity | Progressive nested field disclosure · Index-aware prioritization · Type-aware operator suggestions · Enum value suggestions · `$expr` context switching · JavaScript sandbox with injected helpers (ObjectId, ISODate, dayjs, luxon, faker, lodash) · Multi-line scripts with `return` · Schema auto-trigger for current + foreign collections · Schema banner prompt · Code formatting (Prettier) · Date helper popover (calendar + timezone) |

### New issue to file under #112

| Title | Scope |
|---|---|
| **Module: MongoDB Cluster Monitor Tab** | 10 metric sparklines · slow-query analysis with kill · DB profiler · server info panel · configurable poll interval |

### Captured for future (not filed yet)

- Schema Sampling & Enum Detection (foundational for #408/#410 enum features)
- Index Management UI
- Validation Rules Editor
- Write Protection (cross-cutting, all DBs)
- 8 auth methods + SSH tunneling + connection auto-cap
- Cross-instance collection copy
- MCP Server (separate epic — aligns with `Epic/enpower AI capability`)
- Command palette (Ctrl+K) — cross-cutting
- Theme editor with 3-color seed generation — cross-cutting
- Split panels + detached windows — cross-cutting
- Data generator (Faker)
- Operation logs / audit trail

---

## 4. Public messaging guidance

**Do NOT** name Monghoul (or any specific competitor by name) in:
- GitHub issues / PRs / commits / changelog
- README or any user-facing doc
- Marketing copy

**Frame all derived tasks as**:
- "competitive parity with modern MongoDB GUIs"
- "industry-standard behavior"
- "matches user expectations from leading MongoDB tools"
- "best-practice UX for [feature]"

This file is the only place the name appears.
