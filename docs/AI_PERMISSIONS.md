# AI permissions

SQL database and document database connections share one AI permission chain across built-in Data Studio and external MCP clients. This policy does not grant database privileges or change manual database access.

For each action (read, create data, update data, delete data, manage structure/administration), resolve an explicit connection allow/deny first, otherwise use the system default, otherwise deny. Omitted connection decisions inherit; explicit false is a denial. Presets are shortcuts for these individual decisions.

Data Studio only operates on attached connections. Inherited attachment permissions use the live connection policy, rather than a permission snapshot. Custom conversation restrictions can narrow access, but cannot grant an operation denied by the connection chain. Ask/Auto controls confirmation and never grants CRUD permissions. Backend checks run again before execution, including retries.

On a new installation, system defaults allow read, create, and update, and deny delete and management. The sidebar assistant follows the active connection's resolved policy, so it can write data when that policy permits it. By default, Ask mode requires confirmation for elevated operations; Auto mode runs permitted elevated operations without confirmation. Destructive operations require confirmation in either mode unless an Always Allow rule applies. Always Allow never overrides a connection or conversation permission denial. Legacy policy migration preserves existing restrictions instead of resetting them to the new-installation defaults.

An empty set of allowed actions denies access. There is no separate MCP exposure setting or connection allowlist. Connection metadata returned to AI clients excludes inaccessible connections; Data Studio discovery is additionally limited to its attached connections. The MCP server's availability and auto-start preference remain service settings.

Read & modify data includes data deletion but excludes structure and administration. Mixed operations require every affected permission: SQL writes inspect statement tokens, bulk requests inspect every action, and aggregation pipelines that write require write and management access. Risk controls confirmation independently from action permissions.

Elasticsearch indexing with an automatically generated ID requires create permission. Indexing with an explicit ID also requires update permission because it can replace a document; this distinction also applies to bulk index actions. Bulk create actions require only create permission. Update and reindex scripts, including stored scripts and bulk update scripts, additionally require delete permission because scripts can delete documents. This conservative check applies even to scripts that do not delete, and upserts still require create permission. Permitted scripted operations follow the destructive confirmation flow.

Legacy allowlists migrate to explicit connection decisions preserving exclusions. When an allowlist existed, new connections default to no access. Existing per-connection restrictions are preserved. Corrupt or unreadable policy files deny execution rather than falling back to permissive settings. Policy writes are atomic and take effect for subsequent calls without restarting the bridge.

DocKit uses a release tag for the shared agent runtime and locks its resolved Git commit in Cargo.lock. Each application owns its permission policy and database-operation classification.

The application-owned `ai_permissions` module resolves policy, migrates legacy settings, classifies database payloads, and gates both MCP and built-in agent execution. The shared agent routes requests through an application preparation hook and carries its confirmation risk and context; it does not resolve this permission chain. Execution rechecks the application policy on every attempt.

AI schema reads use the same application gate as tool calls. Cached schema and editor context are included only when the associated connections permit reading. Manual UI capability invocations retain their existing access behavior.

Agent executors are bound to a conversation and its connection/source identities. Before dispatch they reload connection policy, current attachment restrictions, and confirmation rules. Detaching or deleting a source prevents subsequent dispatches. The sidebar uses its bound active connection without requiring a Data Studio attachment.

Preparation rejects denied calls before displaying confirmation. A queued call whose confirmation requirements become stricter returns to the existing approval flow. Permission denials are terminal and do not trigger transport retries; approval never bypasses a later denial. Rechecks occur at dispatch and do not cancel operations already dispatched or erase context already sent to a model.
