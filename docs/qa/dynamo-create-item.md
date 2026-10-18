# DynamoDB Create Item investigation and regression checks

## Reported failure

Reproduction: open Create Item, then select a newly created empty table. The Primary Key section has no inputs. PR #522 changed label resolution, but did not reload schema after selection changed.

The original UI also displayed no pending state while DescribeTable was in flight. This explains keys appearing after a delay when the initial request targets the right table. The lifecycle bug is independent of item count. Newly listed tables usually have only a name cached, making the failure easy to reproduce with an empty table.

## Pipeline traced before the fix

1. `create-table-modal.vue` calls `dynamoManageStore.createTable` → `dynamoApi.createTable` → `dynamo__create_table` → DynamoDB CreateTable. The management view refreshes table names afterward.
2. `tool-bar.vue` calls `tabStore.setActiveTable`. That setter updates the selected name; it does not describe the table.
3. `create-item.vue` formerly called `fetchIndices(connection, tableName)` only during setup. Selecting a table after setup did not run DescribeTable.
4. `connectionStore.fetchIndices` → `dynamoApi.describeTable` → `dynamo__describe_table` → DynamoDB DescribeTable. The response contains key schema and attribute definitions, including for a table with no items. TypeScript derives partition/sort key names and types and caches the summary using `upsertTable`.
5. Create Item formerly read `findTable` to derive labels. Missing cached metadata made the `v-if` key inputs disappear, while its validation still enabled Create.
6. Submit builds typed attributes → `connectionStore.createItem` → `dynamoApi.createItem` → `invoke_capability(dynamo__create_item)` → Rust `create_item` → shared `convert_attributes`/`convert_json_to_attr_value` → DynamoDB PutItem.
7. The response returns through `parseCapabilityResponse`. That parser requires a non-null data field, while successful create/update/delete responses formerly returned null.
8. Query/Scan/PartiQL flatten AttributeValues into JSON. Both edit entry points formerly inferred attribute types from those values, losing the distinction between sets/lists and binary/strings.

## Fixes

- Watch connection ID and table name, including initial mount. Load schema for each target, clear the previous draft immediately, and ignore stale responses and responses after unmount.
- Require valid key metadata before Create can become enabled. While switching tables, replace the entire form with a skeleton frame matching the Manage panel shimmer, minimum 500 ms loading display, theme tokens, and reduced-motion behavior. Reset/Create are disabled until schema loading ends. Errors retain the Retry action.
- Reset restores the selected table's optional secondary-index attribute rows. Unfilled optional rows are omitted from the payload.
- Share value validation and payload construction: retain NULL and false BOOL, allow empty non-key strings/binary, reject invalid numbers/base64/structured values and duplicate attribute names. Index key values are validated as keys when filled.
- Use text-backed decimal inputs for DynamoDB numbers so browser number conversion cannot round large integers before submission.
- Return explicit creation/skipped outcomes and non-null write response data. Report duplicate creation as skipped. Escape partition key names in the conditional expression, require metadata when duplicate protection is requested, and accept legacy string boolean flags.
- Retain top-level attribute type metadata alongside Query UI and PartiQL rows, including pagination. Both edit dialogs use the same form builder; reopening discards unsaved drafts, NULL updates are retained, and unchanged attributes are not rewritten. Saving an unchanged/key-only item closes without an invalid empty update.
- Preserve u64 numeric strings and readback. Use bigint-aware JSON formatting in structured editors and result cells.

## Shared-code impact

| Changed path                  | Consumers traced                                                                    | Compatibility and checks                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `convert_attributes`          | Create, update keys/attributes, delete, batch writes, transaction put/update/delete | Valid payloads retain their ordering/types. Duplicate names now fail before any request, including transaction context. Existing write-path regressions pass.            |
| Number conversion             | N and NS through every shared write path; query/scan/PartiQL/batch-get readback     | Added exact unsigned-integer handling; nonfinite values still rejected. Listed decimal formats and both requested large integer examples checked against DynamoDB Local. |
| Read response metadata        | Query, Scan, PartiQL → API types → dbDataStore → both edit parents                  | Additive optional `attribute_types`; ordinary items remain unchanged. Append/reset tests check alignment.                                                                |
| ResultPanel object formatting | Elasticsearch, MongoDB, DynamoDB and document browsing                              | Uses the existing bigint-aware serializer. Normal JSON rendering is unchanged. Relevant result/editor/JSON tests pass.                                                   |
| Successful write data         | UI parser and agent/MCP create/update/delete                                        | Non-null response objects satisfy the existing strict parser. Conditional skip stays successful for callers, with an explicit skipped marker for UI.                     |

## Checks performed

- Frontend tests: schema arrival after mount; connection/table switches; stale response rejection; load failure/retry; unmount cleanup; Reset; primary/index keys; NULL/BOOL; empty values; invalid sets/base64/numbers; duplicate names; large numbers; shared edit form; Query UI and PartiQL metadata pagination; real write-response parser; relevant ES/Mongo/result regressions.
- Rust DynamoDB suite: existing shared conversion, agent boundary, create/update/delete, batch and transaction tests, plus duplicate names, unsigned precision, and conditional-expression escaping.
- Disposable DynamoDB Local at `127.0.0.1:18000`: numeric key roundtrip, structured/string-encoded arguments, missing key/type/value rejection, no partial update, empty sets rejected, empty set members accepted, all ten top-level types, exact requested numeric examples, PartiQL type metadata, update roundtrip, batch inserted/skipped/error counts, malformed transaction with zero changes, delete readback. Tables are created with unique QA names and deleted by the test.
- Browser harness with real Vue components/stores and mocked IPC: select table after mount; numeric and composite primary key rendering/submission; loading and denied schema states; default false BOOL and NULL payloads; empty set rejection; empty SS member acceptance; padded/unpadded BS validation; Cancel/reopen draft isolation; skipped-create warning.
- Original investigation results: 369 frontend/store/result checks and 282 Rust checks passed, including the opt-in DynamoDB Local flow. TypeScript, targeted ESLint, production frontend build, and macOS application packaging passed.
- The resulting Apple Silicon app was installed to `/Applications/DocKit.app`; its executable checksum matches the packaged app, and the app was relaunched.

The browser harness uses mock transport; the separate live Rust run verifies the database and agent capability behavior. Native file selection and both complete grid parent workflows were not manually exercised against AWS.

## PR validation (2026-10-18)

The DynamoDB changes were checked in an isolated worktree based on `origin/master`, without the Task Manager gate or GEEKFUN copy changes from PR #527.

- `npm run lint:check` and `npm run build` passed, including Vue/TypeScript checks.
- Targeted editor, result, DynamoDB API/store, JSON, and language suites: 243 tests passed across 14 suites.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib dynamo`: 281 passed; the opt-in local flow was ignored in this run.
- The opt-in `dynamo_local_item_flow` passed separately against a disposable DynamoDB Local container. The container was stopped afterward.
- Browser harness recheck: no initial table disables Create; selecting an empty numeric-key table shows the loading state and then its primary-key input. Submitting `9007199254740993` retains that exact numeric string in the typed request and enables duplicate protection.
- All changed Rust files pass `rustfmt --check`. The repository-wide `cargo fmt --check` reports existing formatting differences in unchanged `src-tauri/src/lib.rs` and `src-tauri/src/session.rs`.

## Coverage follow-up (2026-10-18)

- Added 25 frontend regression cases and five Rust tests that run in the normal CI suite.
- HTTP-mocked Query, Scan, and PartiQL responses now exercise all ten DynamoDB attribute types, mixed per-row types, pagination, exact unsigned numeric-set values, and the SDK's unknown-variant fallback. These checks do not require DynamoDB Local.
- Added coverage for empty metadata rows, skipped duplicate creation, legacy edit-form type inference and precedence, BigInt result rendering, missing attribute names/types, stale schema failures, and pagination when either page omits type metadata.
- The full JavaScript suite passed: 1,859 tests across 55 suites. The instrumented DynamoDB Rust suite passed: 286 tests, with the existing opt-in local flow left ignored.
- Local Istanbul coverage is 100% for statements, lines, functions, and branches in `dynamo-edit-form.ts`, `dynamo-attribute.ts`, `dynamo-item-form.ts`, and `useDynamoItemForm.ts`. Local LLVM coverage executes every measured line in `item_attribute_types`, including its unknown-type fallback.
- ESLint, Vue/TypeScript checks, and formatting of the changed Rust files passed. Codecov's combined patch percentage is calculated by CI and may differ from local per-file results.

## Repeat

```sh
npx jest --runInBand tests/views/editor/dynamo-editor tests/dbDataStore.test.ts tests/datasources/dynamoWriteContract.test.ts
cargo test --manifest-path src-tauri/Cargo.toml --lib dynamo

docker run -d --rm -p 127.0.0.1:18000:8000 --name dockit-ddb-qa amazon/dynamodb-local
DOCKIT_DYNAMO_QA_ENDPOINT=http://127.0.0.1:18000 cargo test --manifest-path src-tauri/Cargo.toml --lib dynamo_local_item_flow -- --ignored --nocapture
docker stop dockit-ddb-qa

# Browser harness: open /tests/manual/dynamo-create-item.html on this dev server.
npx vite --host 127.0.0.1
```
