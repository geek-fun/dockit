<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Cliente GUI de código aberto para Elasticsearch, OpenSearch, DynamoDB e MongoDB — um único aplicativo desktop nativo para todos os seus bancos de dados NoSQL.**

**Privacidade em primeiro lugar. Seus dados, suas chaves. Código aberto.**

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

[Download](https://www.geekfun.club/download) · [Documentação](https://www.geekfun.club/docs/dockit/) · [Site](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

[English](README.md) · [简体中文](README_zh.md) · Português (BR) · [日本語](README_ja.md) · [한국어](README_ko.md) · [Español](README_es.md)

</div>

---

O DocKit substitui consoles de navegador como o Kibana e o AWS Console por um único aplicativo desktop nativo. Descreva o que você precisa em linguagem natural e receba consultas prontas para executar, ou use diretamente os editores baseados em Monaco. Compatível com OpenAI, Anthropic e DeepSeek — basta trazer sua própria chave.

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

## Instalação

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

## Comunidade vs Ultimate

O DocKit segue uma única compilação oficial com um modo Community/Ultimate em tempo de execução (o código-fonte permanece Apache-2.0).

**Community (grátis para sempre):** todas as fontes de dados (Elasticsearch / OpenSearch / DynamoDB / MongoDB / EasySearch), conexões ilimitadas com autenticação direta básica (usuário/senha, chaves de acesso estáticas), TLS, criptografia de credenciais no chaveiro do sistema operacional, os editores completos baseados em Monaco e os construtores visuais de consultas, navegação e edição inline, exportação de conjuntos de resultados (CSV / JSON / Markdown / cópia), histórico de consultas e consultas salvas, navegação de metadados, DynamoDB Local.

**Ultimate ($9.9/mês · $99/ano, 7 dias de teste grátis):**

| Recurso | Incluído |
|---|---|
| IA — agente, NL2SQL, explicação, otimização, correção com um clique (traga sua própria chave de LLM) | ✅ |
| Gerenciamento e monitoramento de cluster — nós, shards, índices, templates, allocation | ✅ |
| Servidor MCP integrado | ✅ |
| Importação e exportação em lote / por arquivo | ✅ |
| Aprimoramentos de conexão remota — túnel SSH, proxy HTTP/SOCKS | ✅ |
| Credenciais de nuvem — AWS Profile / SSO / IAM | ✅ |

**Trava de versão:** todas as versões publicadas durante uma assinatura ativa permanecem desbloqueadas para sempre — offline, mesmo após o fim da assinatura. O teste de 7 dias desbloqueia tudo durante o período de teste, mas não concede direitos de trava de versão. Serviços em nuvem (ex.: sincronização) exigem uma assinatura ativa.

Veja a [página de preços](https://www.geekfun.club/pricing) para mais detalhes.

## Principais recursos

### Agentic Data Studio

Descreva o que você precisa em linguagem natural — o agente escreve consultas, inspeciona esquemas, atualiza documentos, exclui registros, cria índices e retorna resultados.

- **Geração de consultas** — linguagem natural para Elasticsearch DSL, PartiQL, consultas MongoDB
- **Inspeção de esquema** — o agente lê e explica o esquema do seu banco de dados
- **Operações de dados** — CRUD, gerenciamento de índices, ações em lote por meio de conversação
- **Segurança** — permissões por fonte, confirmação obrigatória para operações destrutivas, credenciais nunca expostas ao LLM
- **Provedores compatíveis** — OpenAI, Anthropic, DeepSeek, Requesty, Opper, Atlas Cloud, [API Route](https://api-route.com), Cheaper Inference, Runcrate, CloudGPU, cheapaimodel, [Standard Compute](https://standardcompute.com), [UberLLM](https://uberllm.dev), Ollama, LM Studio

### DynamoDB

Ferramentas visuais para DynamoDB — construtor de consultas, editor PartiQL, gerenciamento de tabelas, importação/exportação.

- **Construtor de consultas** — scan e query com filtragem por chave primária e mais de 13 operadores
- **Editor PartiQL** — autocompletar, realce de sintaxe, CRUD inline de itens
- **Gerenciamento de tabelas** — criar e modificar tabelas, gerenciar índices (GSI/LSI), TTL, streams, PITR, criptografia
- **DynamoDB Local** — desenvolvimento offline sem credenciais AWS
- **Autenticação** — perfis AWS, SSO, chaves de acesso, papéis IAM

### MongoDB

Cliente MongoDB completo com editor de consultas, navegador de documentos e importação/exportação.

- **Editor de consultas** — autocompletar, formatação de resultados, suporte a escrita em lote
- **Navegador de documentos** — paginação, CRUD inline
- **Visão de gerenciamento** — índices, estatísticas de armazenamento e metadados de coleções em um relance
- **Conexões** — autenticação, TLS, configurações de replica set
- **Importação / Exportação** — JSON, CSV, JSONL

### Elasticsearch & OpenSearch

Tipos de conexão separados com configurações independentes. Editor baseado em Monaco com realce de sintaxe completo e autocompletar.

- **Gerenciamento de cluster** — saúde dos nós, estado dos shards, acompanhamento de índices, controle de aliases
- **Autenticação** — suporte nativo a API key para ES e OpenSearch
- **Editor** — Monaco (mecanismo do VS Code), JSON5, comentários inline, autocompletar de campos a partir do mapeamento em tempo real
- **Catálogo de gramática** — mais de 120 endpoints de API do ES e OpenSearch para referência
- **Suporte a versões** — Elasticsearch 1.x–9.x, OpenSearch 1.x–3.x

### Gerenciamento e monitoramento

- **Saúde do cluster** — status dos nós, estado dos shards, métricas de armazenamento
- **Gerenciamento de índices** — criar, excluir, abrir, fechar, gerenciar aliases e mapeamentos
- **Metadados de tabelas/coleções** — visualizar e editar esquema, índices e configurações

### Histórico de consultas

- **Registro automático** — cada consulta salva, sem necessidade de salvar manualmente
- **500 entradas por conexão** — armazenadas localmente, com busca
- **Replay** — copiar, recarregar no editor ou reexecutar consultas anteriores
- **Abrange** — PartiQL, MongoDB e consultas de formulário visual

### Importação e exportação

- **Formatos** — JSON, CSV, JSONL
- **Escala** — operações em lote lidam com milhões de registros
- **Casos de uso** — migração de cluster, backup, preparação de ambientes de desenvolvimento

### Privacidade e segurança

- **Sem telemetria** — o DocKit não envia dados para servidores externos
- **Armazenamento local** — consultas, credenciais e análises permanecem na sua máquina
- **Criptografado** — perfis de conexão protegidos pelo chaveiro do seu sistema operacional
- **Air gap** — totalmente capaz de operar offline, sem necessidade de internet

### Acessibilidade

- **Navegação por teclado** — Tab por todos os elementos interativos, setas em listas e árvores, Enter/espaço para ativar
- **Leitor de tela** — botões de ação e resultados de consultas totalmente acessíveis
- **Indicadores de foco** — visíveis em todos os elementos interativos


## Desenvolvimento
O DocKit é construído com [Tauri](https://tauri.app/) (Rust), Vue 3 + TypeScript, [shadcn-vue](https://www.shadcn-vue.com/), [UnoCSS](https://unocss.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/) e Pinia.

### Pré-requisitos

- Node.js >= 20
- NPM >= 10
- Toolchain Rust (para Tauri)

### Configuração

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
cd dockit
npm install
npm run tauri dev
```

### Compilação

```bash
npm run tauri build         # plataforma atual
npm run build:macos         # macOS Universal
```


## Contribuição

Issues e PRs são bem-vindos. Consulte o [guia de contribuição](CONTRIBUTION.md).

## Comunidade

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

## Patrocínio

<p align="center">
  <img src="docs/images/wechat_ponsor.jpg" width="140" alt="WeChat Sponsor QR">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_Support-EA4AAA?logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
</p>

## Licença

[Apache 2.0](LICENSE) © GEEKFUN
