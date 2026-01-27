<div align="center">
<a href="https://github.com/geek-fun/dockit"><img src="public/dockit.png" width="120"/></a>
</div>
<h1 align="center">DocKit</h1>
<div align="center">

[![Node.js CI](https://github.com/geek-fun/dockit/actions/workflows/node.yml/badge.svg)](https://github.com/geek-fun/dockit/actions/workflows/node.yml)
[![package release](https://github.com/geek-fun/dockit/actions/workflows/release.yml/badge.svg)](https://github.com/geek-fun/dockit/actions/workflows/release.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/geek-fun/dockit/badge.svg)](https://snyk.io/test/github/geek-fun/dockit)
[![codecov](https://codecov.io/gh/geek-fun/dockit/branch/master/graph/badge.svg?token=GqlkEVgMvR)](https://codecov.io/gh/geek-fun/dockit)
[![GitHub version](https://badge.fury.io/gh/geek-fun%2Fdockit.svg)](https://badge.fury.io/gh/geek-fun%2Fdockit)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

<strong>DocKit is a desktop client designed for NoSQL database, support Elasticsearch, OpenSearch and DynamoDB across Mac, windows and Linux.</strong>

</div>

## Client

![client UI](public/client-ui.png)

## Feature

- Full-featured editor, Powered by monaco-editor the backbones of vscode, provide familiar editor environment for developers
- Keep your connections, Keep your connections in desktop apps, move the dependencies of dashboard tools
- File persistence, Save your code in your machine as file, never lost
- Multi engines support, Support Elasticsearch, OpenSearch, DynamoDB, and more to come

## Roadmap

| Database           | Status         | Progress        |
| ------------------ | -------------- | --------------- |
| 🔍 Elasticsearch   | ✅ Supported   | 🟢🟢🟢 Complete |
| 🔎 OpenSearch      | ✅ Supported   | 🟢🟢🟢 Complete |
| 🗄️ DynamoDB        | ✅ Supported   | 🟢🟢🟢 Complete |
| 🍃 MongoDB         | 🚧 In Progress | 🟡🟡⚪ Planning |
| ☁️ Azure Cosmos DB | 📋 Planned     | 🟡⚪⚪ Upcoming |

## Installation

Available to download for free from [here](https://github.com/geek-fun/dockit/releases).

## Build Guidelines

### Prerequisites

- Node.js >= 20
- NPM >= 10

### Clone the code

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
```

### Install dependencies

```bash
npm install
```

### Compile and run

```bash
npm run tauri dev
```

## Styling Architecture

The project uses a hybrid styling approach during the migration period:

### Current Setup

1. **UnoCSS** - Atomic CSS utilities loaded via `virtual:uno.css` in `src/main.ts`
2. **shadcn-vue** - Component library styles via `src/assets/styles/tailwind.css` (CSS variables)
3. **Legacy SCSS** - Existing styles via `src/assets/styles/theme.scss` (retained for backward compatibility)
4. **Naive UI** - Current component library with auto-imported components

### Style Entry Points

- `src/main.ts` - Main entry point importing all style layers
- `src/assets/styles/tailwind.css` - shadcn-vue CSS variables and base styles
- `src/assets/styles/theme.scss` - Legacy CSS variables and theme definitions
- `uno.config.ts` - Unified UnoCSS configuration with all presets and theme tokens

### Theme Configuration

Brand colors are defined in multiple places for compatibility:
- CSS variables in `theme.scss` for legacy components
- CSS variables in `tailwind.css` for shadcn-vue components
- Theme tokens in `uno.config.ts` for UnoCSS utilities

For a detailed audit of component usage, see [docs/naive-ui-sass-audit.md](docs/naive-ui-sass-audit.md).

## About

### Wechat Official Account

<img src="docs/images/wechat_official.png" alt="wechat official account qr code" width="360" />

### Sponsor

If this project helpful for you, feel free to buy me a cup of coffee ☕️.

- Github Sponsor  
  [![Sponsor](https://img.shields.io/badge/-Sponsor-fafbfc?logo=GitHub-Sponsors)](https://github.com/sponsors/[geek-fun])

- Wechat Sponsor  
  <img src="docs/images/wechat_ponsor.jpg" alt="wechat sponsor qr code" width="200" />
