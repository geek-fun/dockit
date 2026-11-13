<div align="center">

<img src="public/dockit.png" width="120" alt="DocKit Logo"/>

# DocKit

**Cliente GUI de código abierto para Elasticsearch, OpenSearch, DynamoDB y MongoDB — una sola app de escritorio nativa para todas tus bases de datos NoSQL.**

**Privacidad primero. Tus datos, tus claves. Código abierto.**

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

[Descargar](https://www.geekfun.club/download) · [Documentación](https://www.geekfun.club/docs/dockit/) · [Sitio web](https://www.geekfun.club/products/dockit/) · [Releases](https://github.com/geek-fun/dockit/releases)

[English](README.md) · [简体中文](README_zh.md) · [Português (BR)](README_pt-BR.md) · [日本語](README_ja.md) · [한국어](README_ko.md) · Español

</div>

---

DocKit reemplaza consolas de navegador como Kibana y AWS Console con una única app de escritorio nativa. Describe lo que necesitas en lenguaje natural y obtén consultas listas para ejecutar, o usa directamente los editores basados en Monaco. Compatible con OpenAI, Anthropic y DeepSeek — trae tu propia clave.

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

## Instalación

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

## Community vs Ultimate

DocKit sigue una única compilación oficial con un modo Community/Ultimate en tiempo de ejecución (el código fuente permanece bajo Apache-2.0).

**Community (gratis para siempre):** todas las fuentes de datos (Elasticsearch / OpenSearch / DynamoDB / MongoDB / EasySearch), conexiones ilimitadas con autenticación directa básica (usuario/contraseña, claves de acceso estáticas), TLS, cifrado de credenciales en el llavero del sistema operativo, los editores completos basados en Monaco y los constructores visuales de consultas, exploración y edición en línea, exportación de conjuntos de resultados (CSV / JSON / Markdown / copiar), historial de consultas y consultas guardadas, exploración de metadatos, DynamoDB Local.

**Ultimate ($9.9/mes · $99/año, prueba gratis de 7 días):**

| Función | Incluido |
|---|---|
| IA — agente, NL2SQL, explicación, optimización, corrección con un clic (usa tu propia clave de LLM) | ✅ |
| Gestión y monitoreo de clúster — nodos, shards, índices, plantillas, allocation | ✅ |
| Servidor MCP integrado | ✅ |
| Importación y exportación por lotes / a nivel de archivo | ✅ |
| Mejoras de conexión remota — túnel SSH, proxy HTTP/SOCKS | ✅ |
| Credenciales en la nube — AWS Profile / SSO / IAM | ✅ |

**Bloqueo de versión:** todas las versiones publicadas durante una suscripción activa quedan desbloqueadas para siempre — sin conexión, incluso después de que la suscripción finalice. La prueba de 7 días desbloquea todo durante el periodo de prueba, pero no otorga derechos de bloqueo de versión. Los servicios en la nube (p. ej. sincronización) requieren una suscripción activa.

Consulta la [página de precios](https://www.geekfun.club/pricing) para más detalles.

## Características principales

### Agentic Data Studio

Describe lo que necesitas en lenguaje natural — el agente escribe consultas, inspecciona esquemas, actualiza documentos, elimina registros, crea índices y devuelve resultados.

- **Generación de consultas** — de lenguaje natural a Elasticsearch DSL, PartiQL, consultas de MongoDB
- **Inspección de esquemas** — el agente lee y explica el esquema de tu base de datos
- **Operaciones de datos** — CRUD, gestión de índices y acciones masivas mediante conversación
- **Seguridad** — permisos por fuente, confirmación para operaciones destructivas, credenciales nunca expuestas al LLM
- **Proveedores compatibles** — OpenAI, Anthropic, DeepSeek, Requesty, Opper, Atlas Cloud, [API Route](https://api-route.com), Cheaper Inference, Runcrate, CloudGPU, cheapaimodel, [Standard Compute](https://standardcompute.com), [UberLLM](https://uberllm.dev), Ollama, LM Studio

### DynamoDB

Herramientas visuales para DynamoDB — constructor de consultas, editor PartiQL, gestión de tablas, importación/exportación.

- **Constructor de consultas** — scan y query con filtrado por clave primaria y más de 13 operadores
- **Editor PartiQL** — autocompletado, resaltado de sintaxis, CRUD de elementos en línea
- **Gestión de tablas** — crear y modificar tablas, administrar índices (GSI/LSI), TTL, streams, PITR, cifrado
- **DynamoDB Local** — desarrollo sin conexión y sin credenciales de AWS
- **Autenticación** — perfiles de AWS, SSO, claves de acceso, roles de IAM

### MongoDB

Cliente de MongoDB con todas las funciones: editor de consultas, explorador de documentos e importación/exportación.

- **Editor de consultas** — autocompletado, formateo de resultados, soporte de escritura masiva
- **Explorador de documentos** — paginación, CRUD en línea
- **Vista de administración** — índices, estadísticas de almacenamiento y metadatos de colecciones de un vistazo
- **Conexiones** — autenticación, TLS, configuraciones de replica set
- **Importación / Exportación** — JSON, CSV, JSONL

### Elasticsearch & OpenSearch

Tipos de conexión separados con configuraciones independientes. Editor basado en Monaco con resaltado de sintaxis completo y autocompletado.

- **Gestión de clúster** — salud de los nodos, estado de los shards, seguimiento de índices, control de alias
- **Autenticación** — soporte nativo de API key tanto para ES como para OpenSearch
- **Editor** — Monaco (motor de VS Code), JSON5, comentarios en línea, autocompletado de campos a partir del mapeo en vivo
- **Catálogo de gramática** — más de 120 endpoints de la API de ES y OpenSearch como referencia
- **Compatibilidad de versiones** — Elasticsearch 1.x–9.x, OpenSearch 1.x–3.x

### Gestión y monitoreo

- **Salud del clúster** — estado de los nodos, estado de los shards, métricas de almacenamiento
- **Gestión de índices** — crear, eliminar, abrir, cerrar, administrar alias y mapeos
- **Metadatos de tablas/colecciones** — ver y editar esquema, índices y configuraciones

### Historial de consultas

- **Grabación automática** — cada consulta se guarda, sin necesidad de guardar manualmente
- **500 entradas por conexión** — almacenadas localmente, con búsqueda
- **Repetición** — copiar, volver a cargar en el editor o volver a ejecutar consultas anteriores
- **Cubre** — PartiQL, MongoDB y consultas de formulario visual

### Importación y exportación

- **Formatos** — JSON, CSV, JSONL
- **Escala** — las operaciones por lotes manejan millones de registros
- **Casos de uso** — migración de clúster, respaldo, carga inicial de entornos de desarrollo

### Privacidad y seguridad

- **Sin telemetría** — DocKit no envía datos a servidores externos
- **Almacenamiento local** — consultas, credenciales y análisis permanecen en tu equipo
- **Cifrado** — perfiles de conexión protegidos por el llavero de tu sistema operativo
- **Aislamiento (air gap)** — funciona completamente sin conexión, no requiere internet

### Accesibilidad

- **Navegación con teclado** — Tab por todos los elementos interactivos, flechas en listas y árboles, Enter/espacio para activar
- **Lector de pantalla** — botones de acción y resultados de consultas totalmente accesibles
- **Indicadores de foco** — visibles en todos los elementos interactivos


## Desarrollo
DocKit está construido con [Tauri](https://tauri.app/) (Rust), Vue 3 + TypeScript, [shadcn-vue](https://www.shadcn-vue.com/), [UnoCSS](https://unocss.dev/), [Monaco Editor](https://microsoft.github.io/monaco-editor/) y Pinia.

### Requisitos previos

- Node.js >= 20
- NPM >= 10
- Toolchain de Rust (para Tauri)

### Configuración

```bash
git clone https://github.com/geek-fun/dockit.git --depth=1
cd dockit
npm install
npm run tauri dev
```

### Compilación

```bash
npm run tauri build         # plataforma actual
npm run build:macos         # macOS Universal
```


## Contribuir

Issues y PRs son bienvenidos. Consulta la [guía de contribución](CONTRIBUTION.md).

## Comunidad

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

## Patrocinio

<p align="center">
  <img src="docs/images/wechat_ponsor.jpg" width="140" alt="WeChat Sponsor QR">
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/sponsors/geek-fun"><img src="https://img.shields.io/badge/GitHub_Sponsors-%E2%9D%A4_Support-EA4AAA?logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" /></a>
</p>

## Licencia

[Apache 2.0](LICENSE) © GEEKFUN
