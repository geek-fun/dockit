<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Open-source GUI client for Elasticsearch, OpenSearch, DynamoDB and MongoDB — one native desktop app for all your NoSQL databases.**

**Privacy-first. Your data, your keys. Open source.**

[![Release](https://img.shields.io/github/v/release/geek-fun/dockit?color=orange&label=release&style=for-the-badge&logo=github)](https://github.com/geek-fun/dockit/releases)
[![Downloads](https://img.shields.io/github/downloads/geek-fun/dockit/total?color=orange&style=for-the-badge&logo=docusign)](https://github.com/geek-fun/dockit/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=for-the-badge&logo=apache)](LICENSE)
[![Stars](https://img.shields.io/github/stars/geek-fun/dockit?style=for-the-badge&logo=github)](https://github.com/geek-fun/dockit/stargazers)
[![CI](https://github.com/geek-fun/dockit/actions/workflows/node.yml/badge.svg?style=for-the-badge)](https://github.com/geek-fun/dockit/actions/workflows/node.yml)

<p>
  <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white"/>
  <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white"/>
  <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black"/>
  <img src="https://img.shields.io/badge/Tauri-FFC131?style=for-the-badge&logo=tauri&logoColor=black"/>
  <img src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white"/>
</p>

[Download](https://www.geekfun.club/download) · [Docs](https://www.geekfun.club/docs/dockit/) · [Website](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

English · [简体中文](README_zh.md)

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

<a href="https://www.geekfun.club/download">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Download-macOS_|_Windows_|_Linux-orange?style=for-the-badge&logo=download&logoColor=white">
    <img src="https://img.shields.io/badge/Download-macOS_|_Windows_|_Linux-orange?style=for-the-badge&logo=download&logoColor=white" alt="Download">
  </picture>
</a>
&nbsp;
<a href="https://github.com/geek-fun/dockit/releases">
  <img src="https://img.shields.io/badge/Releases-GitHub-lightgrey?style=for-the-badge&logo=github" alt="Releases">
</a>
&nbsp;
<a href="https://www.geekfun.club/products/dockit/">
  <img src="https://img.shields.io/badge/Website-geekfun.club-blue?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Website">
</a>

## Key Features

### Agentic Data Studio

Describe what you need in natural language — the agent writes queries, inspects schemas, updates documents, deletes records, creates indexes, and returns results.

- **Query generation** — natural language to Elasticsearch DSL, PartiQL, MongoDB queries
- **Schema inspection** — agent reads and explains your database schema
- **Data operations** — CRUD, index management, bulk actions through conversation
- **Safety** — per-source permissions, confirmation gate for destructive ops, credentials never exposed to the LLM
- **Supported providers** — OpenAI, Anthropic, DeepSeek, Ollama, LM Studio

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

<table width="100%">
  <tr>
    <td align="center" valign="middle" width="55%">
      <img src="docs/images/wechat_group.jpg" width="150" alt="WeChat Group">
      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
      <img src="docs/images/wechat_official.png" width="150" alt="WeChat Official Account">
    </td>
    <td valign="middle" width="45%">
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://discord.gg/5NSUyPK2E"><img src="https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Discord" /></a><br><br>
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://x.com/geekfun_club"><img src="https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white&style=for-the-badge" alt="X / Twitter" /></a><br><br>
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://www.youtube.com/@geekfun-club"><img src="https://img.shields.io/badge/YouTube-Subscribe-FF0000?logo=youtube&logoColor=white&style=for-the-badge" alt="YouTube" /></a><br><br>
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://github.com/geek-fun"><img src="https://img.shields.io/badge/GitHub-Follow-181717?logo=github&logoColor=white&style=for-the-badge" alt="GitHub" /></a>
    </td>
  </tr>
</table>

## Sponsor

<table width="100%">
  <tr>
    <td align="center" valign="middle" width="35%">
      <img src="docs/images/wechat_ponsor.jpg" width="150" alt="WeChat Sponsor QR">
    </td>
    <td valign="middle" width="65%">
      &nbsp;&nbsp;&nbsp;&nbsp;
      <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_Support-EA4AAA?logo=githubsponsors&logoColor=white&style=for-the-badge" alt="GitHub Sponsors" /></a>
    </td>
  </tr>
</table>

## Star History

<a href="https://www.star-history.com/?repos=geek-fun%2Fdockit&type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=geek-fun/dockit&type=date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=geek-fun/dockit&type=date" />
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=geek-fun/dockit&type=date" />
  </picture>
</a>

## License

[Apache 2.0](LICENSE) © GEEKFUN