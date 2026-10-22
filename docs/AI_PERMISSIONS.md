# AI permissions

SQL database and document database connections share one AI permission chain across built-in Data Studio and external MCP clients. This policy does not grant database privileges or change manual database access.

For each action (read, create data, update data, delete data, manage structure/administration), resolve an explicit connection allow/deny first, otherwise use the system default, otherwise deny. Omitted connection decisions inherit; explicit false is a denial. Presets are shortcuts for these individual decisions.

Data Studio only operates on attached connections. Inherited attachment permissions use the live connection policy, rather than a permission snapshot. Custom conversation restrictions can narrow access, but cannot grant an operation denied by the connection chain. Ask/Auto controls confirmation and never grants CRUD permissions. Backend checks run again before execution, including retries.

An empty set of allowed actions denies access. There is no separate MCP exposure setting or connection allowlist. Connection metadata returned to AI clients excludes inaccessible connections; Data Studio discovery is additionally limited to its attached connections. The MCP server's availability and auto-start preference remain service settings.

Read & modify data includes data deletion but excludes structure and administration. Mixed operations require every affected permission: SQL writes inspect statement tokens, bulk requests inspect every action, and aggregation pipelines that write require write and management access. Risk controls confirmation independently from action permissions.

Legacy allowlists migrate to explicit connection decisions preserving exclusions. When an allowlist existed, new connections default to no access. Existing per-connection restrictions are preserved. Corrupt or unreadable policy files deny execution rather than falling back to permissive settings. Policy writes are atomic and take effect for subsequent calls without restarting the bridge.

Both applications pin the shared permission implementation to an exact Git revision in their Cargo manifests and lockfiles so builds use the same policy behavior.
