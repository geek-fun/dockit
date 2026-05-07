<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**AI 驱动的 NoSQL 数据库桌面客户端。用自然语言写查询。在一个界面里管理 DynamoDB、Elasticsearch 和 OpenSearch。**
**快。本地优先。不依赖云。**

[![Release](https://img.shields.io/github/v/release/geek-fun/dockit?color=orange&label=release)](https://github.com/geek-fun/dockit/releases)
[![Downloads](https://img.shields.io/github/downloads/geek-fun/dockit/total?color=orange)](https://github.com/geek-fun/dockit/releases)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Stars](https://img.shields.io/github/stars/geek-fun/dockit)](https://github.com/geek-fun/dockit/stargazers)
[![CI](https://github.com/geek-fun/dockit/actions/workflows/node.yml/badge.svg)](https://github.com/geek-fun/dockit/actions/workflows/node.yml)

[官网](https://www.geekfun.club/dockit/) · [文档](https://www.geekfun.club/docs/dockit/) · [下载](https://www.geekfun.club/download) · [Releases](https://github.com/geek-fun/dockit/releases)

</div>

## 特性

DocKit 是一个开源的 NoSQL 数据库桌面 GUI 客户端。用原生应用替代浏览器控制台和付费工具，基于 [Tauri](https://tauri.app/) + Vue 3 + [shadcn-vue](https://www.shadcn-vue.com/) + [UnoCSS](https://unocss.dev/) 构建。

- **AI 查询。** 用自然语言描述需求，生成准确的 DynamoDB PartiQL 或 Elasticsearch 查询。支持 OpenAI 和 DeepSeek。
- **统一界面。** DynamoDB、Elasticsearch、OpenSearch，一个应用搞定。
- **本地优先。** 连接信息、查询、历史都存在本地。零遥测。离线可用。

### AI 助手

问"上周注册的用户"或"按地区汇总销售额"，直接拿到查询。不是简单的自动补全。DocKit 会读取你的表结构，生成能跑的查询。

### DynamoDB

- **可视化查询。** 不写代码也能扫描和查询表。主键过滤、复杂条件，UI 里搞定。
- **PartiQL 编辑器。** SQL 风格语法，自动补全，语法高亮，格式化。
- **内联编辑。** 在查询结果里直接改数据、删条目。
- **表管理。** 看表、管索引、查容量和条目数。
- **DynamoDB Local。** 连本地实例，离线开发，不用 AWS 凭证。

### Elasticsearch & OpenSearch

- **Monaco 编辑器。** 和 VS Code 同款引擎。语法高亮、自动补全、你熟悉的快捷键。
- **集群管理。** 节点健康、分片状态、索引跟踪、别名控制。
- **API Key 认证。** 原生支持 Elasticsearch API Key。

### 查询历史

每次执行的查询都会记录。不用手动保存。每个连接存 500 条，都在你机器上。复制、重新执行、或者加载回编辑器。包括 PartiQL 语句和可视化查询。

### 导入导出

JSON、CSV、JSONL。批量处理百万条记录。迁移集群、备份表、给开发环境塞数据。

### 隐私安全

- DocKit 不回传任何数据。查询内容、凭证、使用统计都不离本地。
- 连接信息通过系统密钥链加密存储。
- 不联网也能用。支持离线环境。

## 截图

| AI 助手 | 查询历史 |
|:---:|:---:|
| ![AI](public/dockit-ai-assistant-question.png) | ![History](public/dockit-query-history.png) |

| DynamoDB 可视化查询 | PartiQL 编辑器 |
|:---:|:---:|
| ![Visual Query](public/dockit-dynamodb-query-ui.png) | ![PartiQL](public/dockit-dynamodb-partiql.png) |

## 支持的数据库

| 数据库 | 状态 |
|---|---|
| Elasticsearch | 已支持 |
| OpenSearch | 已支持 |
| DynamoDB | 已支持 |
| MongoDB | 开发中 |
| Azure Cosmos DB | 规划中 |

## 安装

| 平台 | 下载 |
|---|---|
| **macOS** (Universal) | [DocKit\_universal.dmg](https://github.com/geek-fun/dockit/releases/latest) |
| **Windows** (x64) | [DocKit\_x64-setup.exe](https://github.com/geek-fun/dockit/releases/latest) |
| **Linux** (AppImage / deb) | [DocKit\_amd64.AppImage](https://github.com/geek-fun/dockit/releases/latest) |

所有版本在 [releases 页面](https://github.com/geek-fun/dockit/releases)。

## 开发

### 环境要求

- Node.js >= 20
- NPM >= 10
- Rust 工具链 (Tauri)

### 本地运行

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
cd dockit
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build          # 当前平台
npm run build:macos          # macOS Universal
```

### 技术栈

| 层级 | 技术 |
|---|---|
| 桌面框架 | [Tauri](https://tauri.app/) (Rust) |
| 前端 | Vue 3 + TypeScript |
| UI 组件 | [shadcn-vue](https://www.shadcn-vue.com/) (Radix Vue) |
| 样式 | [UnoCSS](https://unocss.dev/) |
| 编辑器 | [Monaco Editor](https://microsoft.github.io/monaco-editor/) |
| 状态管理 | Pinia |

## 贡献

欢迎提 Issue 和 PR。先看 [贡献指南](CONTRIBUTION.md)。

## 社区

<img src="docs/images/wechat_official.png" alt="微信公众号" width="240"/>

## 赞助

如果 DocKit 对你有帮助，[GitHub Sponsors](https://github.com/sponsors/geek-fun) 支持一下。

<img src="docs/images/wechat_ponsor.jpg" alt="微信赞助二维码" width="200"/>

## 许可证

[Apache 2.0](LICENSE) © GEEKFUN