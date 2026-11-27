<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Open-source GUI client for Elasticsearch, OpenSearch, DynamoDB and MongoDB — one native desktop app for all your NoSQL databases.**

**Privacy-first. Your data, your keys. Open source.**

[![Release](https://img.shields.io/github/v/release/geek-fun/dockit?color=orange&label=release&logo=github)](https://github.com/geek-fun/dockit/releases)
[![Downloads](https://img.shields.io/github/downloads/geek-fun/dockit/total?color=orange&logo=docusign)](https://github.com/geek-fun/dockit/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg&logo=apache)](LICENSE)
[![Stars](https://img.shields.io/github/stars/geek-fun/dockit&logo=github)](https://github.com/geek-fun/dockit/stargazers)
[![CI](https://github.com/geek-fun/dockit/actions/workflows/node.yml/badge.svg)](https://github.com/geek-fun/dockit/actions/workflows/node.yml)
[![MCP Toplist](https://mcptoplist.com/badge/io.github.geek-fun%2Fdata-studio.svg)](https://mcptoplist.com/server/io.github.geek-fun%2Fdata-studio)

<p>
  <img src="https://img.shields.io/badge/macOS-000000&logo=apple&logoColor=white"/>
  <img src="https://img.shields.io/badge/Windows-0078D6&logo=windows&logoColor=white"/>
  <img src="https://img.shields.io/badge/Linux-FCC624&logo=linux&logoColor=black"/>
  <img src="https://img.shields.io/badge/Tauri-FFC131&logo=tauri&logoColor=black"/>
  <img src="https://img.shields.io/badge/Rust-000000&logo=rust&logoColor=white"/>
</p>

[Download](https://www.geekfun.club/download) · [Docs](https://www.geekfun.club/docs/dockit/) · [Website](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

English · [简体中文](README_zh.md) · [Português (BR)](README_pt-BR.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md)

</div>

---

DocKit replaces browser consoles like Kibana and AWS Console with a single native desktop app. Describe what you need in natural language and get runnable queries, or use the Monaco-powered editors directly. Supports OpenAI, Anthropic, and DeepSeek — bring your own key.

<p align="center">
  <img src="https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenSearch-005EB8?logo=opensearch&logoColor=white" />
  <img src="https://img.shields.io/badge/DynamoDB-4053D6?logo=amazondynamodb&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/EasySearch-4A90D9?logoColor=white" />
</p>

<p align="center">
  <img src="docs/images/dockit-client-ui-demo.gif" width="800" alt="DocKit Client UI Demo"/>
</p>

## Installation

Download the latest installer for **macOS** (Apple Silicon & Intel `.dmg`), **Windows** (`.exe` / `.msi`), or **Linux** (`.deb`, `.rpm`, `.AppImage`):

- **[Download Page (geekfun.club)](https://www.geekfun.club/download#dockit)** — direct installers for macOS, Windows, and Linux
- **[GitHub Releases](https://github.com/geek-fun/dockit/releases/latest)** — all installers and release notes

> Closing the DocKit window keeps background tasks and the MCP server running. Use **Show Window** from the DocKit menu-bar or system-tray icon to return to your session. Choose **Quit** from that menu to stop the app.

### AI Agent Integration (MCP)

Connect Claude Code, OpenAI Codex, Cursor, Windsurf, OpenCode, or any MCP client to your DocKit databases via [`@geek-fun/data-studio-mcp`](https://github.com/geek-fun/data-studio-agent).

```bash
# Claude Code
claude mcp add --transport stdio data-studio -- npx -y @geek-fun/data-studio-mcp

# OpenAI Codex
codex mcp add data-studio -- npx -y @geek-fun/data-studio-mcp

# Run directly
npx -y @geek-fun/data-studio-mcp
```

<details>
<summary><strong>JSON configuration (Cursor, Windsurf, .mcp.json, or custom port)</strong></summary>

Add to `.mcp.json`, `.cursor/mcp.json`, or `~/.cursor/mcp.json` (omit `env` to auto-discover the port, default `9120`):

```json
{
  "mcpServers": {
    "data-studio": {
      "command": "npx",
      "args": ["-y", "@geek-fun/data-studio-mcp"],
      "env": {
        "DOCKIT_MCP_PORT": "9120"
      }
    }
  }
}
```

</details>

- **Local & private** — local HTTP bridge on `127.0.0.1`; credentials stay in DocKit and agents only see opaque connection IDs
- **Granular permissions** — configure **Settings → MCP Bridge → Default AI permissions** (**No access**, **Read**, **Read & modify data**, **Full access**, **Custom**) with per-connection overrides
- **NoSQL tools** — list connections, inspect indices, mappings, collections, and DynamoDB tables, run queries, and perform permitted operations

> **Note:** Keep DocKit running with **Auto-start** enabled in **Settings → MCP Bridge** (on by default). Run alongside [SqlKit](https://github.com/geek-fun/sqlkit) to expose both NoSQL and SQL databases through the same MCP server.
>
> **Docs:** [MCP Bridge Guide](https://www.geekfun.club/docs/dockit/mcp-bridge) · [Quick Start](https://www.geekfun.club/docs/data-studio-agent/quick-start) · [MCP Server README](https://github.com/geek-fun/data-studio-agent/blob/master/packages/data-studio-mcp/README.md)

## Key Features

### Agentic Data Studio

Describe what you need in natural language — the agent writes queries, inspects schemas, updates documents, deletes records, creates indexes, and returns results.

- **Query generation** — natural language to Elasticsearch DSL, PartiQL, MongoDB queries
- **Schema inspection** — agent reads and explains your database schema
- **Data operations** — CRUD, index management, bulk actions through conversation
- **Safety** — per-source permissions, confirmation gate for destructive ops, credentials never exposed to the LLM
- **Supported providers** — OpenAI, Anthropic, DeepSeek, Requesty, Opper, Atlas Cloud, [API Route](https://api-route.com), Cheaper Inference, Runcrate, CloudGPU, cheapaimodel, [Standard Compute](https://standardcompute.com), [MartLLM](https://martllm.com), Ollama, LM Studio

### DynamoDB

Visual tools for DynamoDB — query builder, PartiQL editor, table management, import/export.

- **Query Builder** — scan and query with primary key filtering and 13+ operators
- **PartiQL Editor** — autocomplete, syntax highlighting, inline item CRUD
- **Table management** — create, modify tables, manage indexes (GSI/LSI), TTL, streams, PITR, encryption
- **DynamoDB Local** — offline development without AWS credentials
- **Authentication** — AWS profiles, SSO, access keys, IAM roles

### MongoDB

Full-featured MongoDB client with query editor, document browser, and import/export.

- **Query editor** — autocomplete, result formatting, bulk write support
- **Document browser** — pagination, inline CRUD
- **Manage view** — indexes, storage stats, collection metadata at a glance
- **Connections** — authentication, TLS, replica set configurations
- **Import / Export** — JSON, CSV, JSONL

### Elasticsearch & OpenSearch

Separate connection types with independent configs. Monaco-powered editor with full syntax highlighting and autocomplete.

- **Cluster management** — node health, shard state, index tracking, alias control
- **Authentication** — native API key support for both ES and OpenSearch
- **Editor** — Monaco (VS Code engine), JSON5, inline comments, field autocomplete from live mapping
- **Grammar catalog** — 120+ ES and OpenSearch API endpoints for reference
- **Version support** — Elasticsearch 1.x–9.x, OpenSearch 1.x–3.x

### Management & Monitoring

- **Cluster health** — node status, shard states, storage metrics
- **Index management** — create, delete, open, close, manage aliases and mappings
- **Table/collection metadata** — view and edit schema, indexes, and configurations

### Query History

- **Auto-recording** — every query saved, no manual save needed
- **500 entries per connection** — stored locally, searchable
- **Replay** — copy, reload into editor, or re-execute past queries
- **Covers** — PartiQL, MongoDB, and visual form queries

### Import & Export

- **Formats** — JSON, CSV, JSONL
- **Scale** — batch operations handle millions of records
- **Use cases** — cluster migration, backup, dev environment seeding

### Privacy & Security

- **No telemetry** — DocKit does not phone home
- **Local storage** — queries, credentials, analytics stay on your machine
- **Encrypted** — connection profiles secured by your OS keychain
- **Air gap** — fully offline capable, no internet required

### Accessibility

- **Keyboard navigation** — tab through all interactive elements, arrow keys in lists and trees, enter/space to activate
- **Screen reader** — action buttons and query results fully accessible
- **Focus indicators** — visible on all interactive elements


## Development
DocKit is Built with [Tauri](https://tauri.app/) (Rust), Vue 3 + TypeScript, [shadcn-vue](https://www.shadcn-vue.com/), [UnoCSS](https://unocss.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), and Pinia.

### Prerequisites

- Node.js >= 20
- NPM >= 10
- Rust toolchain (for Tauri)

### Setup

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
cd dockit
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build         # current platform
npm run build:macos         # macOS Universal
```


## Contributing

Issues and PRs welcome. Check the [contribution guide](CONTRIBUTION.md).

## Community

<p align="center">
  <img src="docs/images/wechat_official.png" width="300" alt="WeChat Official Account">
</p>

<p align="center">
  <a href="https://x.com/geekfun_club"><img src="https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white" alt="X / Twitter" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://www.youtube.com/@geekfun-club"><img src="https://img.shields.io/badge/YouTube-Subscribe-FF0000?logo=youtube&logoColor=white" alt="YouTube" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://github.com/geek-fun"><img src="https://img.shields.io/badge/GitHub-Follow-181717?logo=github&logoColor=white" alt="GitHub" /></a>
</p>

## Sponsor

<p align="center">
  <img src="docs/images/wechat_ponsor.jpg" width="140" alt="WeChat Sponsor QR">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_Support-EA4AAA?logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
</p>

## License

[Apache 2.0](LICENSE) © GEEKFUN
