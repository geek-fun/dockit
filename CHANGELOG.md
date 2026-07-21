# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.3.0] - 2026-07-21

### Added

- **SSH tunneling with shared profiles** — connect to databases through SSH tunnels with configurable profiles, supporting key-based and password authentication, multi-hop configurations, and profile management (#463)
- **Requesty as an AI provider** — add Requesty to the supported LLM provider list alongside OpenAI, Anthropic, and DeepSeek (#462)

## [1.2.0] - 2026-06-30

### Changed

- **Migrate agent engine to external `data-studio-agent` crate** — extract 12+ inline modules (chat formatters, loop runner, compact, conversation, provider adapter, token counter, tool executor, model registry, etc.) into a reusable Rust crate, reducing the codebase by ~4,100 lines (#460)
  - Agent loop, LLM formatting (OpenAI, Anthropic), provider routing, token budgeting, conversation management, and tool execution now live in the external crate
  - Thin `agent_adapters.rs` layer bridges the crate back to Dockit's capability system, session store, and HTTP client
  - Simplifies maintenance and enables reuse across projects

### Fixed

- Fix agent context awareness: restore assistant role branch in `build_llm_messages` and inject synthetic tool results for missing tool calls to prevent HTTP 400 errors during multi-tool turns (#460)
- Fix system prompt priority chain: instruct LLM to prefer attached sources, then explicit source names, then `list_connections` as last resort (#460)
- Fix `useDataStudioChatAgent` context provider — use `sessionSource.databaseType` (frozen snapshot, always correct) instead of `attachedSource.databaseType` (can be wrong after migration) (#460)

### Documentation

- Restructure README for better scannability: convert prose paragraphs to bullet-point format, add prominent download badge buttons, add English/Chinese language toggle links, reduce oversized QR codes (#459).

## [1.1.1] - 2026-06-05

### Added

- Move session metadata from localStorage to agent.sqlite (#458)
- Migrate query history from .store.dat to agent.sqlite (#457)

### Fixed

- Reset autoCompact to true, remove dead useChatStore, and clean up redundant chatSettings key (#456)
- Comprehensive review and sync of all EN/ZH translations (#454)

## [1.1.0] - 2026-06-04

### Added

- AI Data Studio: multi-provider agent backend with chat-based data exploration (OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio) (#431)
- Multi-source agent architecture with per-source permissions and connection-aware tool routing (#437)
- Native MongoDB support in Data Studio agent with 6 tools (find, aggregate, insert, update, delete, list collections) (#438)
- Agent context compaction, permission modes (Ask/Auto), and chat UX hardening (#440)
- LLM multi-provider refactor: ChatFormatter abstraction, Anthropic streaming, proxy mode selector, error classification, ES alias tools (#444)
- AI improvements for sidebar and data studio: keyboard navigation, searchable select, resizable chat panel, accessibility (#449)
- MongoDB: connection management with SCRAM and URI authentication modes (#415)
- MongoDB: comprehensive query editor with Monaco syntax highlighting, autocomplete, and validation (#422)
- MongoDB: query execution backend with shell syntax parser (#429)
- MongoDB: bulkWrite support and persistent query results per tab (#430)
- MongoDB: Manage View for collection-level infrastructure browsing (#432)
- MongoDB: Manage View enhancements and bug fixes (#443)
- MongoDB: document browser with full CRUD operations (insert, edit, clone, delete) (#441)
- MongoDB: Export & Import in JSON, CSV, and JSONL formats (#448)
- MongoDB: query history metadata with star/bookmark favorites (#447)
- DynamoDB: table lifecycle management Phase 1 — create, delete, truncate tables (#419)
- DynamoDB: table lifecycle Phase 2 — billing mode, TTL, PITR, streams, danger zone (#420)
- EasySearch as a new connection type (Elasticsearch 7.10 fork) (#428)
- OpenSearch split from Elasticsearch as a separate connection type (#425)
- Unified capability registry migrating all legacy datasource functions (#450)
- Inline source management UI for Data Studio with connection chips and add-source dropdown (#433)
- Agent loop improvements and chat panel scroll-to-bottom behavior (#453)

### Fixed

- GSI warm throughput validation and cleanup (#445)
- Destructive agent operations now always require confirmation; target source shown on card
- MongoDB PR #422 review feedback: 17 issues resolved including validation, i18n, circular dependencies (#427)
- README database icons rendering (GitHub compatibility)

### Changed

- Refactored data studio source management to inline chips and dropdown UI (#433)
- Unified capability registry replacing legacy per-source datasource functions (#450)

## [1.0.1] - 2026-05-11

### Added

- Add comprehensive keyboard navigation support for accessibility (#417)

### Fixed

- Fix snippet insertion for query language commands (#416)
- Fix incorrect documentation URLs (#413)

## [1.0.0] - 2026-05-07

### Added

- Add ES|QL query completion support for Elasticsearch (#401)
- Add query language registry with SQL/PPL/EQL support (#402)
- Add body completion for index and component templates (#403)
- Add column sorting for indices and templates tables in Manage panel (#406)

### Fixed

- Fix PartiQL validation and import for new DynamoDB tables (#400)
- Fix missing docPath for API documentation shortcuts (#395)

## [0.9.10] - 2026-04-29

### Fixed

- Field type snippets now only suggested at value positions inside properties/fields blocks (#394)
- Enhance indices sorting, filtering and toggle UX in autocomplete (#393)
- Persist connection version after connecting (#392)
- Fix Ctrl+D doc shortcut not working for all ES APIs (#391)
- Fix scroll issue in fixed-height containers on macOS Monterey (#390)

## [0.9.9] - 2026-04-28

### Added

- Add SSO and AssumeRole authentication for DynamoDB connections (#378)
- Add unified searchable select component across the codebase (#388)
- Add AWS profile and environment variable authentication for DynamoDB (#377)
- Add credential-based connection model for DynamoDB multi-table workflows (#375)
- Improve connection floating button UX with speed-dial pattern (#369)

### Fixed

- Improve search DSL auto-completion accuracy and coverage (#389)
- Fix console queries not executing after navigating to Import/Export tab (#387)

### Security

- Resolve rustls-webpki security vulnerabilities (#379)

## [0.9.8] - 2026-04-22

### Added

- Add keyboard navigation and empty state CTA to history view for improved accessibility (#368)

## [0.9.7] - 2026-04-20

### Added

- Add ability to clone an existing connection from the connection list (#365)
- Add query parameter value autocomplete in the editor (#364)
- Support creating a new index/table during import (#361)

## [0.9.6] - 2026-04-14

### Fixed

- Fix update install failing immediately by re-fetching a fresh update manifest before downloading to avoid expired signed URLs

## [0.9.5] - 2026-04-14

### Fixed

- Fix update install failing immediately on click due to relaunch error propagation
- Extend update relaunch timeout from 5s to 30s to accommodate slower platforms (macOS notarization, Windows installer)

### Changed

- Gate CI checks on push to master in addition to pull requests
- Gate release publish on all platform builds succeeding to prevent partial releases

## [0.9.4] - 2026-04-14

### Added

- Add sort and filter to connections list with ascending/descending direction toggle (#360)
- Add progress bar with percentage indicator during update download and install (#360)

### Fixed

- Fix keyboard shortcuts not working on Windows (#359)

### Changed

- Gate release pipeline on version bump to prevent spurious CI runs

## [0.9.3] - 2026-04-08

### Fixed

- Fix keyboard shortcuts not working on Windows (#356)

### Changed

- Modernize release pipeline and updater mechanism (#354)

## [0.9.2] - 2026-04-04

### Added

- Enable shortcut dialog to allow user view all available shortcuts (#351)

### Fixed

- Fix Windows about menu (#350)
- Fix the latest.json collect issues
- Fix auto updater required json file not upload issue (#346)

### Security

- Security upgrade lodash from 4.17.23 to 4.18.1 (#353)

## [0.9.1] - 2026-03-28

### Added

- Add API Key authentication for Elasticsearch connections (#343)

### Fixed

- Auto completion issue fix (#345)

## [0.9.0] - 2026-03-20

### Added

- Implement query history (#328)
- Add PartiQL document formatting provider (#327)
- Enable DynamoDB Local support via optional endpoint URL (#326)

### Changed

- Migrate UI from Naive UI to shadcn-vue + UnoCSS (#323)
- Migrate update mechanism to official Tauri updater plugin (#341)

### Fixed

- Post migration issues (#338)
- Fix loadHttpClient not pass required credentials (#310)

### Security

- Security upgrade markdown-it from 14.1.0 to 14.1.1 (#322)
