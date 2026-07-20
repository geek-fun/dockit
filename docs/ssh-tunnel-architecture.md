# SSH Tunnel Architecture

## Pipeline Overview

All SSH tunnel resolution converges through three layers, shared across all database types and all request paths.

```
                        ┌─────────────────────────────────────┐
                        │         ConnectionResolver          │
                        │  normalize_es / mongo / dynamo       │
                        │  (host cleaned at source)            │
                        │  src-tauri/src/common/               │
                        │  connection_resolver.rs              │
                        └───────────────┬─────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
      fetch_api                  invoke_capability              agent path
   (dashboard CRUD:           (dashboard indices:            (Data Studio tools:
   PUT /index, GET /_cat,     _cat/indices, aliases,         es__cat_indices,
   etc.)                      templates, etc.)               mongo__list_collections,
            │                           │                     etc.)
            ▼                           ▼                           ▼
   resolve_url_via_ssh         resolve_config_via_ssh       resolve_ssh_in_config
   fetch_client.rs             commands.rs                  agent_adapters.rs
   (Url::parse cleans)         (reads normalized host)      (reads normalized host)
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        ▼
                              resolve_ssh_tunnel
                            (persistent, deterministic key)
                              ssh_bridge.rs
                                        │
                                        ▼
                              resolve_connection_target
                              (build_transport_layers +
                               start_transport_layers)
                                        │
                                        ▼
                              TunnelManager.start_tunnel
                              (double-checked locking,
                               port reuse by deterministic key)
```

## Three Request Paths

### 1. `fetch_api` — Dashboard CRUD Operations

- **Trigger**: `loadHttpClient(conn).put/post/get/delete()` → `invoke('fetch_api', ...)`
- **Entry**: `src-tauri/src/fetch_client.rs::fetch_api`
- **SSH resolution**: `resolve_url_via_ssh(app, url, ssh_config)`
- **Host source**: Parsed from URL via `Url::parse()` → `parsed.host_str()`
- **Used by**: `esApi.createIndex`, `esApi.catNodes`, cluster stats, direct HTTP calls

### 2. `invoke_capability` — Dashboard Capability Handlers

- **Trigger**: `invokeCapability('es__cat_indices', args, connectionId)` → `invoke('invoke_capability', ...)`
- **Entry**: `src-tauri/src/capabilities/commands.rs::invoke_capability`
- **SSH resolution**: `resolve_config_via_ssh(app, &mut config)` — mutates config in-place
- **Host source**: From `ConnectionResolver::resolve` → `normalize_es` / `normalize_mongo` / `normalize_dynamo`
- **Used by**: `esApi.catIndices`, `esApi.catAliases`, `esApi.deleteIndex`, all `invokeCapability` calls

### 3. Agent Path — Data Studio Tools

- **Trigger**: Agent loop invokes tools via `execute` → `invoke_capability_inner`
- **Entry**: `src-tauri/src/agent_adapters.rs::resolve_connections`
- **SSH resolution**: `resolve_ssh_in_config(app, &mut config)` — modifies config before passing to loop runner
- **Host source**: From `ConnectionResolver::resolve` → same normalized configs as path 2
- **Used by**: All agent tool invocations (`es__cat_indices`, `mongo__list_collections`, `dynamo__list_tables`, etc.)

## Host Normalization — Single Source of Truth

All paths converge through `ConnectionResolver::resolve` → `normalize_config`:

### `normalize_es` / `normalize_mongo`
```rust
// src-tauri/src/common/connection_resolver.rs

fn normalize_es(conn: Value) -> Value {
    // Strips http:// / https:// prefix from stored host.
    // ES connections may save host as "http://es-host" in .store.dat.
    let clean = v.trim_start_matches("http://").trim_start_matches("https://");
    config.insert("host", Value::String(clean.to_string()));
    // ...
}
```

### `normalize_dynamo`
```rust
fn normalize_dynamo(conn: Value) -> Result<Value, String> {
    // endpointUrl is always a full URL (e.g. "http://dynamodb.local:8000")
    // No host stripping needed — downstream consumers parse via Url::parse()
    config.insert("endpointUrl", Value::String(url));
    // ...
}
```

### `extract_remote_target` (Agent Path)

```rust
// src-tauri/src/agent_adapters.rs

fn extract_remote_target(config: &Value) -> (String, u16) {
    // Prefer host/port (ES, MongoDB)
    if let (Some(host), Some(port)) = (...) {
        return (host.to_string(), port as u16);
    }
    // Fallback: endpointUrl (DynamoDB)
    if let Some(url_str) = obj.get("endpointUrl") {
        let parsed = Url::parse(url_str)?;
        return (parsed.host_str()?, parsed.port()?);
    }
    ("localhost".into(), 443)
}
```

## Database Type Alignment

| Step | Elasticsearch / OpenSearch | MongoDB | DynamoDB |
|---|---|---|---|
| **Store field** | `host: "es-host"` or `"http://es-host"` | `host: "mongo-host"` or `"http://mongo-host"` | `endpointUrl: "http://dynamo.local:8000"` |
| **normalize** | `trim_start_matches("http://")` | same as ES | `Url::parse()` by downstream |
| **extract target** | `obj.get("host")` | `obj.get("host")` | `obj.get("endpointUrl")` → `Url::parse()` |
| **SSH tunnel** | clean hostname | clean hostname | clean hostname |
| **Config mutation** | `host → 127.0.0.1` | `host → 127.0.0.1` | `endpointUrl → http://127.0.0.1:port` |
| **ssh field** | removed after resolution | removed after resolution | removed after resolution |

## Tunnel Key Strategy

All paths use `resolve_ssh_tunnel` → `tunnel_key()` which generates **deterministic** keys based on SSH config + remote target:

```
ssh:profiles:{sorted_profile_ids}:{host}:{port}      (profile-based)
ssh:inline:{host}:{port}:{user}:{auth}:{host}:{port}  (inline config)
direct:{host}:{port}                                   (no SSH)
```

Same SSH profile + same remote host:port → same tunnel key → **tunnel reuse** across all three paths. No UUID keys, no per-request tunnel creation/destruction.

## Tunnel Lifecycle

- **Start**: `TunnelManager.start_tunnel()` — double-checked locking, port reuse
- **Reconnect**: `tunnel_reconnect_loop()` — exponential backoff, max 5 attempts
- **Keepalive**: `forward_loop()` pings SSH session every `keepalive_interval_secs`
- **Stop**: `TunnelManager.stop_tunnel()` — only on app exit or explicit disconnect
- **Persistence**: Tunnels survive across requests — no cleanup after each call

## Key Files

| File | Role |
|---|---|
| `src-tauri/src/common/connection_resolver.rs` | Normalizes stored connections (host cleaning) |
| `src-tauri/src/common/ssh_bridge.rs` | `resolve_ssh_tunnel`, `tunnel_key`, `resolve_connection_target` |
| `src-tauri/src/capabilities/commands.rs` | `invoke_capability` + `resolve_config_via_ssh` |
| `src-tauri/src/agent_adapters.rs` | Agent connection resolution + `resolve_ssh_in_config` |
| `src-tauri/src/fetch_client.rs` | Dashboard `fetch_api` + `resolve_url_via_ssh` |
| `src-tauri/src/ssh/tunnel.rs` | `TunnelManager`, `forward_loop`, `tunnel_reconnect_loop` |
| `src-tauri/src/ssh/config.rs` | `SshTunnelConfig`, `SshConnectionConfig`, `TransportLayerConfig` |

## Anti-Patterns Eliminated

- ❌ Ad-hoc scheme stripping in SSH resolution functions → ✅ Single point in `normalize_es`/`normalize_mongo`
- ❌ UUID-based ephemeral tunnel keys → ✅ Deterministic persistent tunnel keys
- ❌ Agent path bypassing SSH resolution entirely → ✅ Resolved before loop runner
- ❌ `fetch_api` and `invoke_capability` using different tunnel strategies → ✅ Unified via `resolve_ssh_tunnel`
- ❌ `createIndex`/`createTemplate` not refreshing dashboard → ✅ Auto-refresh like `createAlias`
