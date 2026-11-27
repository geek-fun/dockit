<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Elasticsearch、OpenSearch、DynamoDB 和 MongoDB 的开源 GUI 客户端 —— 一个原生桌面应用管理所有 NoSQL 数据库。**

**隐私优先。您的数据，您的密钥。开源开放。**

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

[下载](https://www.geekfun.club/download) · [文档](https://www.geekfun.club/docs/dockit/) · [官网](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

[English](README.md) · 简体中文

</div>

---

DocKit 用一个原生桌面应用替代 Kibana 和 AWS Console 等浏览器控制台。用自然语言描述需求，即可生成可执行的查询；也可以直接使用 Monaco 驱动的编辑器。支持 OpenAI、Anthropic 和 DeepSeek —— 自带密钥即可使用。

<p align="center">
  <img src="https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenSearch-005EB8?logo=opensearch&logoColor=white" />
  <img src="https://img.shields.io/badge/DynamoDB-4053D6?logo=amazondynamodb&logoColor=white" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/EasySearch-4A90D9?logoColor=white" />
</p>

## 安装

下载适用于 **macOS**（Apple Silicon 与 Intel `.dmg`）、**Windows**（`.exe` / `.msi`）或 **Linux**（`.deb`、`.rpm`、`.AppImage`）的最新安装包：

- **[官方下载页（geekfun.club）](https://www.geekfun.club/zh/download#dockit)** — 获取 macOS、Windows 和 Linux 安装包
- **[GitHub Releases](https://github.com/geek-fun/dockit/releases/latest)** — 所有平台安装包与更新日志

> 关闭 DocKit 窗口后，后台任务和 MCP 服务仍会在后台运行。可通过菜单栏或系统托盘图标中的 **显示窗口** 恢复界面，或选择 **退出** 停止应用。

### AI 编程助手集成（MCP）

通过 [`@geek-fun/data-studio-mcp`](https://github.com/geek-fun/data-studio-agent) 将 Claude Code、OpenAI Codex、Cursor、Windsurf、OpenCode 或任意 MCP 客户端连接到 DocKit 中已配置的数据库。

```bash
# Claude Code
claude mcp add --transport stdio data-studio -- npx -y @geek-fun/data-studio-mcp

# OpenAI Codex
codex mcp add data-studio -- npx -y @geek-fun/data-studio-mcp

# 直接运行
npx -y @geek-fun/data-studio-mcp
```

<details>
<summary><strong>JSON 配置（Cursor、Windsurf、.mcp.json 或自定义端口）</strong></summary>

添加到 `.mcp.json`、`.cursor/mcp.json` 或 `~/.cursor/mcp.json`（省略 `env` 将自动发现端口，默认 `9120`）：

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

- **本地私密** — 仅监听 `127.0.0.1` 的本地 HTTP 桥接；凭据始终留在 DocKit，Agent 仅看到不透明的连接 ID
- **细粒度权限** — 在 **设置 → MCP 桥接 → 默认 AI 权限** 中配置（**禁止访问**、**读取**、**读取和修改数据**、**完全访问**、**自定义**），支持按连接覆盖
- **NoSQL 工具** — 列出连接、查看索引/映射/集合/DynamoDB 表结构、执行查询及权限范围内的文档与管理操作

> **提示：** 保持 DocKit 运行并在 **设置 → MCP 桥接** 中开启 **自动启动**（默认开启；关闭窗口后仍在菜单栏或系统托盘运行）。与 [SqlKit](https://github.com/geek-fun/sqlkit) 同时运行时，同一个 MCP 服务器即可同时暴露 NoSQL 和 SQL 数据库。
>
> **文档：** [MCP 桥接指南](https://www.geekfun.club/zh/docs/dockit/mcp-bridge) · [快速开始](https://www.geekfun.club/zh/docs/data-studio-agent/quick-start) · [MCP 服务器 README](https://github.com/geek-fun/data-studio-agent/blob/master/packages/data-studio-mcp/README_zh.md)

## 主要功能

### Agentic Data Studio

用自然语言描述你的需求 —— Agent 自动编写查询、检查表结构、更新文档、删除记录、创建索引并返回结果。

- **查询生成** — 自然语言转 Elasticsearch DSL、PartiQL、MongoDB 查询
- **表结构检查** — Agent 读取并解释数据库表结构
- **数据操作** — 通过对话完成增删改查、索引管理等操作
- **安全机制** — 按源权限控制，破坏性操作需显式确认，凭据不暴露给 LLM
- **支持的 AI 提供商** — OpenAI、Anthropic、DeepSeek、Requesty、Opper、Atlas Cloud、[API Route](https://api-route.com)、Cheaper Inference、Runcrate、CloudGPU、cheapaimodel、[Standard Compute](https://standardcompute.com)、[MartLLM](https://martllm.com)、Ollama、LM Studio

### DynamoDB

DynamoDB 的可视化管理工具 —— 查询构建器、PartiQL 编辑器、表管理、导入导出。

- **查询构建器** — 支持主键过滤和 13+ 算子的 scan/query
- **PartiQL 编辑器** — 自动补全、语法高亮、内联编辑
- **表管理** — 创建/修改表、管理索引 (GSI/LSI)、TTL、流、PITR、加密
- **DynamoDB Local** — 无需 AWS 凭据即可离线开发
- **认证方式** — AWS 配置文件、SSO、访问密钥、IAM 角色

### MongoDB

功能完备的 MongoDB 客户端 —— 查询编辑器、文档浏览器、导入导出。

- **查询编辑器** — 自动补全、结果格式化、批量写入
- **文档浏览器** — 分页、内联 CRUD
- **管理视图** — 索引、存储统计、集合元数据一览
- **连接方式** — 认证、TLS、副本集配置
- **导入/导出** — JSON、CSV、JSONL

### Elasticsearch & OpenSearch

独立连接类型，各自独立配置。Monaco 编辑器，完整的语法高亮和自动补全。

- **集群管理** — 节点健康、分片状态、索引跟踪、别名控制
- **认证方式** — ES 和 OpenSearch 原生 API Key 支持
- **编辑器** — Monaco（VS Code 引擎）、JSON5、内联注释、字段自动补全
- **语法参考** — 120+ ES 和 OpenSearch API 端点
- **版本支持** — Elasticsearch 1.x–9.x，OpenSearch 1.x–3.x

### 管理与监控

- **集群健康** — 节点状态、分片状态、存储指标
- **索引管理** — 创建、删除、打开、关闭、管理别名和映射
- **表/集合元数据** — 查看和编辑表结构、索引和配置

### 查询历史

- **自动记录** — 每次查询自动保存，无需手动操作
- **每连接 500 条** — 本地存储，可搜索
- **回放** — 复制、重新载入编辑器、重新执行
- **覆盖范围** — PartiQL、MongoDB、可视化表单查询

### 导入导出

- **格式** — JSON、CSV、JSONL
- **规模** — 批量操作可处理数百万条记录
- **场景** — 集群迁移、数据备份、开发环境初始化

### 隐私与安全

- **无遥测** — DocKit 不会回传任何数据
- **本地存储** — 查询、凭据、分析数据都留在你的电脑上
- **加密存储** — 连接信息通过系统密钥链加密
- **离线可用** — 完全支持离线环境

### 无障碍

- **键盘导航** — Tab 切换所有交互元素，方向键导航列表和树
- **屏幕阅读器** — 操作按钮和查询结果完全可达
- **焦点指示** — 所有交互元素都有可见焦点状态

## 开发
DocKit 使用 [Tauri](https://tauri.app/) (Rust)、Vue 3 + TypeScript、[shadcn-vue](https://www.shadcn-vue.com/)、[UnoCSS](https://unocss.dev/)、[Monaco Editor](https://microsoft.github.io/monaco-editor/) 和 Pinia 构建。

### 环境要求

- Node.js >= 20
- NPM >= 10
- Rust 工具链（用于 Tauri）

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

## 贡献

欢迎提交 Issue 和 PR。请查阅[贡献指南](CONTRIBUTION.md)。

## 社区

<p align="center">
  <img src="docs/images/wechat_official.png" width="300" alt="微信公众号">
</p>

<p align="center">
  <a href="https://x.com/geekfun_club"><img src="https://img.shields.io/badge/X-关注-000000?logo=x&logoColor=white" alt="X / Twitter" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://www.youtube.com/@geekfun-club"><img src="https://img.shields.io/badge/YouTube-订阅-FF0000?logo=youtube&logoColor=white" alt="YouTube" /></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://github.com/geek-fun"><img src="https://img.shields.io/badge/GitHub-关注-181717?logo=github&logoColor=white" alt="GitHub" /></a>
</p>

## 赞助

<p align="center">
  <img src="docs/images/wechat_ponsor.jpg" width="140" alt="微信赞助二维码">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_支持-EA4AAA?logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
</p>

## 许可证

[Apache 2.0](LICENSE) © GEEKFUN
