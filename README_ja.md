<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Elasticsearch、OpenSearch、DynamoDB、MongoDB 向けのオープンソース GUI クライアント — すべての NoSQL データベースを 1 つのネイティブデスクトップアプリで。**

**プライバシー最優先。データはあなたのもの、キーもあなたのもの。オープンソース。**

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

[ダウンロード](https://www.geekfun.club/download) · [ドキュメント](https://www.geekfun.club/docs/dockit/) · [公式サイト](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

[English](README.md) · [简体中文](README_zh.md) · [Português (BR)](README_pt-BR.md) · 日本語 · [한국어](README_ko.md) · [Español](README_es.md)

</div>

---

DocKit は、Kibana や AWS Console などのブラウザコンソールを 1 つのネイティブデスクトップアプリに置き換えます。必要なことを自然言語で記述すれば実行可能なクエリが得られ、Monaco 搭載のエディタを直接使うこともできます。OpenAI、Anthropic、DeepSeek に対応 — お使いのキーをご利用いただけます。

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

## インストール

<a href="https://www.geekfun.club/download">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Download-macOS_|_Windows_|_Linux-orange&logo=download&logoColor=white">
    <img src="https://img.shields.io/badge/Download-macOS_|_Windows_|_Linux-orange&logo=download&logoColor=white" alt="Download">
  </picture>
</a>
&nbsp;
<a href="https://github.com/geek-fun/dockit/releases">
  <img src="https://img.shields.io/badge/Releases-GitHub-lightgrey&logo=github" alt="Releases">
</a>
&nbsp;
<a href="https://www.geekfun.club/products/dockit/">
  <img src="https://img.shields.io/badge/Website-geekfun.club-blue&logo=google-chrome&logoColor=white" alt="Website">
</a>

### AI エージェント連携（MCP）

DocKit はローカル HTTP **MCPブリッジ**（`127.0.0.1`）を内蔵しており、オープンソースの [Data Studio MCP サーバー（`@geek-fun/data-studio-mcp`）](https://github.com/geek-fun/data-studio-agent) と連携することで、AI コーディングエージェントが DocKit に設定済みの接続を通じて Elasticsearch、OpenSearch、MongoDB、DynamoDB をクエリ・管理できます。データベースの認証情報はローカル端末内に留まり、MCP の境界を越えることはありません。エージェントが参照するのは不透明な接続 ID のみです。

```bash
# Claude Code
claude mcp add --transport stdio data-studio -- npx -y @geek-fun/data-studio-mcp

# OpenAI Codex
codex mcp add data-studio -- npx -y @geek-fun/data-studio-mcp

# または直接実行
npx -y @geek-fun/data-studio-mcp
```

<details>
<summary><strong>JSON 設定（Cursor、Windsurf、.mcp.json、またはポート指定）</strong></summary>

`.mcp.json`（または `.cursor/mcp.json` / `~/.cursor/mcp.json`）に追加します。ポートは DocKit のローカルポートファイルから自動検出されます（デフォルト `9120`）。特定のポートに固定しない場合は `env` を省略してください：

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

アクセス制御は **設定 → MCPブリッジ → デフォルトのAI権限**（**アクセスなし**、**読み取り**、**データの読み取りと変更**、**フルアクセス**、またはアクション単位の**カスタム**設定）で管理でき、各接続の **AI権限** セクションで個別に上書きできます。**アクセスなし**に設定された接続は MCP の接続検出に表示されず、すべてのリクエストは実行前にポリシーで再検証されます。**設定 → MCPブリッジ** で **自動起動** を有効にした状態で DocKit を起動しておいてください（デフォルトで有効。ウィンドウを閉じてもメニューバーやシステムトレイで稼働を継続します）。

Claude Code、OpenAI Codex、Cursor、Windsurf、OpenCode およびすべての MCP 対応クライアントで動作します。接続一覧の取得、インデックス・マッピング・コレクション・DynamoDB テーブルの確認、クエリ実行、許可されたドキュメント・インデックス・テーブル操作に対応しています。DocKit と [SqlKit](https://github.com/geek-fun/sqlkit) を併用すると、同じ MCP サーバーから NoSQL と SQL の両方のデータベースを利用できます。

詳しくは [DocKit MCP ブリッジガイド](https://www.geekfun.club/docs/dockit/mcp-bridge)、[Data Studio Agent クイックスタート](https://www.geekfun.club/docs/data-studio-agent/quick-start)、[MCP サーバー README](https://github.com/geek-fun/data-studio-agent/blob/master/packages/data-studio-mcp/README.md) をご覧ください。

## 主な機能

### Agentic Data Studio

必要なことを自然言語で記述するだけで — エージェントがクエリの作成、スキーマの確認、ドキュメントの更新、レコードの削除、インデックスの作成を行い、結果を返します。

- **クエリ生成** — 自然言語から Elasticsearch DSL、PartiQL、MongoDB クエリへ
- **スキーマ検査** — エージェントがデータベースのスキーマを読み取り、説明します
- **データ操作** — 会話を通じた CRUD、インデックス管理、一括操作
- **安全性** — データソースごとの権限、破壊的な操作に対する確認ゲート、資格情報は LLM に決して渡されません
- **対応プロバイダー** — OpenAI、Anthropic、DeepSeek、Requesty、Opper、Atlas Cloud、[API Route](https://api-route.com)、Cheaper Inference、Runcrate、CloudGPU、cheapaimodel、[Standard Compute](https://standardcompute.com)、[MartLLM](https://martllm.com)、Ollama、LM Studio

### DynamoDB

DynamoDB 向けのビジュアルツール — クエリビルダー、PartiQL エディタ、テーブル管理、インポート/エクスポート。

- **クエリビルダー** — プライマリキーによるフィルタリングと 13 以上の演算子で scan/query
- **PartiQL エディタ** — オートコンプリート、シンタックスハイライト、インラインでのアイテム CRUD
- **テーブル管理** — テーブルの作成・変更、インデックス（GSI/LSI）の管理、TTL、ストリーム、PITR、暗号化
- **DynamoDB Local** — AWS 資格情報なしでオフライン開発
- **認証** — AWS プロファイル、SSO、アクセスキー、IAM ロール

### MongoDB

クエリエディタ、ドキュメントブラウザ、インポート/エクスポートを備えたフル機能の MongoDB クライアント。

- **クエリエディタ** — オートコンプリート、結果の整形、バルク書き込み対応
- **ドキュメントブラウザ** — ページネーション、インライン CRUD
- **管理ビュー** — インデックス、ストレージ統計、コレクションメタデータをひと目で確認
- **接続** — 認証、TLS、レプリカセット構成
- **インポート / エクスポート** — JSON、CSV、JSONL

### Elasticsearch & OpenSearch

独立した設定を持つ別々の接続タイプ。完全なシンタックスハイライトとオートコンプリートを備えた Monaco 搭載エディタ。

- **クラスタ管理** — ノードの状態、シャードの状態、インデックスの追跡、エイリアスの制御
- **認証** — ES と OpenSearch の両方にネイティブ API キーで対応
- **エディタ** — Monaco（VS Code エンジン）、JSON5、インラインコメント、ライブマッピングからのフィールド補完
- **文法カタログ** — 120 以上の ES および OpenSearch API エンドポイントのリファレンス
- **バージョン対応** — Elasticsearch 1.x–9.x、OpenSearch 1.x–3.x

### 管理とモニタリング

- **クラスタの状態** — ノードのステータス、シャードの状態、ストレージ指標
- **インデックス管理** — 作成、削除、オープン、クローズ、エイリアスとマッピングの管理
- **テーブル/コレクションのメタデータ** — スキーマ、インデックス、設定の表示と編集

### クエリ履歴

- **自動記録** — すべてのクエリを保存、手動保存は不要
- **接続ごとに 500 件** — ローカル保存、検索可能
- **リプレイ** — コピー、エディタへの再読み込み、過去のクエリの再実行
- **対象** — PartiQL、MongoDB、ビジュアルフォームクエリ

### インポートとエクスポート

- **フォーマット** — JSON、CSV、JSONL
- **スケール** — バッチ操作で数百万件のレコードを処理
- **ユースケース** — クラスタ移行、バックアップ、開発環境の初期データ投入

### プライバシーとセキュリティ

- **テレメトリなし** — DocKit はデータを外部に送信しません
- **ローカル保存** — クエリ、資格情報、分析データはすべて手元のマシンに
- **暗号化** — 接続プロファイルは OS のキーチェーンで保護
- **エアギャップ** — 完全オフライン対応、インターネット不要

### アクセシビリティ

- **キーボード操作** — すべてのインタラクティブ要素を Tab で移動、リストやツリーでは矢印キー、Enter/スペースで実行
- **スクリーンリーダー** — アクションボタンとクエリ結果を完全にサポート
- **フォーカス表示** — すべてのインタラクティブ要素に表示


## 開発
DocKit は [Tauri](https://tauri.app/)（Rust）、Vue 3 + TypeScript、[shadcn-vue](https://www.shadcn-vue.com/)、[UnoCSS](https://unocss.dev/)、[Monaco Editor](https://microsoft.github.io/monaco-editor/)、Pinia で構築されています。

### 前提条件

- Node.js >= 20
- NPM >= 10
- Rust ツールチェーン（Tauri 用）

### セットアップ

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
cd dockit
npm install
npm run tauri dev
```

### ビルド

```bash
npm run tauri build         # 現在のプラットフォーム
npm run build:macos         # macOS Universal
```


## コントリビューション

Issue や PR を歓迎します。[コントリビューションガイド](CONTRIBUTION.md)をご確認ください。

## コミュニティ

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

## スポンサー

<p align="center">
  <img src="docs/images/wechat_ponsor.jpg" width="140" alt="WeChat Sponsor QR">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_Support-EA4AAA?logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
</p>

## ライセンス

[Apache 2.0](LICENSE) © GEEKFUN
