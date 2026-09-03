import type { ColumnDef } from '@/components/result';

export type EsResultShape = 'docs' | 'json' | 'text';

type EsSearchHit = {
  _id?: string;
  _index?: string;
  _source?: Record<string, unknown>;
  fields?: Record<string, unknown>;
};

/**
 * Resolve the displayable fields of a hit. Elasticsearch returns data either in
 * `_source` (default searches) or in `fields` (searches with `_source: false` or
 * with explicit `fields` / `docvalue_fields`). `fields` values are arrays; a
 * single-element array is unwrapped so table cells show the scalar like `_source`.
 */
const hitSource = (hit: unknown): Record<string, unknown> | undefined => {
  if (typeof hit !== 'object' || hit === null) return undefined;
  const { _source, fields } = hit as EsSearchHit;
  if (typeof _source === 'object' && _source !== null) return _source;
  if (typeof fields !== 'object' || fields === null) return undefined;
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      Array.isArray(value) && value.length === 1 ? value[0] : value,
    ]),
  );
};

/**
 * Classify an ES/OpenSearch/EasySearch HTTP response body into the view the
 * result panel should render:
 * - `docs`  → `_search` response carrying hits; rendered via shared ResultPanel
 *             (Table/Tree/JSON), including hitless searches without aggregations
 *             so users get a friendly empty state instead of a raw envelope.
 * - `text`  → plaintext bodies (`_cat/*` without format=json).
 * - `json`  → everything else (aggregation-only searches, mappings, settings,
 *             `_bulk`, `_update_by_query`, and 400/404 error envelopes that
 *             fetchApi surfaces as data instead of throwing).
 */
export const resolveEsResultShape = (result: unknown): EsResultShape => {
  if (typeof result === 'string') return 'text';
  if (result === null || typeof result !== 'object') return 'json';

  const body = result as Record<string, unknown>;
  const hitList =
    typeof body['hits'] === 'object' && body['hits'] !== null
      ? (body['hits'] as Record<string, unknown>)['hits']
      : undefined;

  if (!Array.isArray(hitList)) return 'json';
  if (hitList.length === 0 && 'aggregations' in body) return 'json';
  return 'docs';
};

/**
 * Map search hits to rows for the shared ResultPanel, following the repo-wide
 * convention of spreading `_source` onto the row root and appending `_id`
 * (same mapping as index-docs-browser-body.vue). Meta `_id` wins over a source
 * field of the same name.
 */
export const buildDocRows = (hits: unknown[]): Array<Record<string, unknown>> =>
  hits.map((hit, index) => {
    const row: Record<string, unknown> = {
      ...(hitSource(hit) ?? {}),
      _id:
        typeof hit === 'object' && hit !== null
          ? ((hit as EsSearchHit)._id ?? String(index))
          : String(index),
    };
    if (typeof hit === 'object' && hit !== null) {
      const hitIndex = (hit as EsSearchHit)._index;
      if (hitIndex !== undefined) row['_index'] = hitIndex;
    }
    return row;
  });

/**
 * Derive table columns from search hits: sticky `_id` column first, then the
 * sorted union of `_source`/`fields` keys. Nested values degrade to JSON
 * strings inside cells, matching how Mongo/Dynamo panels render complex cells.
 * An optional trailing actions column is appended when row actions are shown.
 */
export const buildDocColumns = (
  hits: unknown[],
  withActions = false,
  actionsTitle = '',
  fieldTypes: Record<string, string> = {},
): ColumnDef[] => {
  const keys = new Set<string>();
  const hasIndex = hits.some(
    hit => typeof hit === 'object' && hit !== null && (hit as EsSearchHit)._index !== undefined,
  );

  for (const hit of hits) {
    for (const key of Object.keys(hitSource(hit) ?? {})) keys.add(key);
  }

  const columns: ColumnDef[] = [{ key: '_id', title: '_id', width: 140, ellipsis: true }];
  if (hasIndex) {
    columns.push({ key: '_index', title: '_index', width: 140, ellipsis: true });
  }
  columns.push(
    ...Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({ key, title: key, ellipsis: true, dataType: fieldTypes[key] })),
  );
  if (withActions) {
    columns.push({
      key: 'actions',
      title: actionsTitle,
      width: 60,
      align: 'center',
      sticky: 'right',
    });
  }
  return columns;
};

export type MappingProperty = {
  type?: string;
  properties?: Record<string, MappingProperty>;
};

const buildTemplateField = (prop: MappingProperty): unknown => {
  if (!prop.type && prop.properties) return buildSchemaTemplate(prop.properties);
  if (prop.type === 'text' || prop.type === 'keyword') return '';
  return null;
};

/**
 * Build an insert skeleton from index mapping properties: string-ish fields
 * (text/keyword) start as empty strings, everything else starts as null so
 * users can fill what they need and delete what they do not.
 */
export const buildSchemaTemplate = (
  properties: Record<string, MappingProperty>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(properties).map(([key, prop]) => [key, buildTemplateField(prop)]),
  );

/**
 * Build an insert template from an existing document (used when the index has
 * no usable mapping). The `_id` is blanked out so the user must supply a new
 * one before the document can be written.
 */
export const buildSampleTemplate = (row: Record<string, unknown>): Record<string, unknown> => ({
  ...row,
  _id: '',
});

/**
 * Split a top-level `_id` field out of a document body: it becomes the
 * addressing id of the write request and must not be stored inside `_source`.
 * An explicitly blank `_id` (the sample-template placeholder) returns `id: ''`
 * so callers can reject the write.
 */
export const extractDocumentId = (
  parsed: unknown,
): { id?: string; body: Record<string, unknown> } => {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { body: {} };
  }
  const doc = parsed as Record<string, unknown>;
  if (!('_id' in doc)) return { body: doc };
  const value = doc['_id'];
  const id = value === null || value === undefined ? '' : String(value);
  const { _id: _omit, ...rest } = doc;
  return { id, body: rest as Record<string, unknown> };
};

/**
 * Resolve the mapping properties of a `GET /{index}/_mapping` response body.
 * Wildcard index patterns return one entry per concrete index — the first one
 * with properties wins.
 */
export const resolveMappingProperties = (mapping: unknown): Record<string, MappingProperty> => {
  if (!mapping || typeof mapping !== 'object') return {};
  for (const entry of Object.values(mapping as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const mappings = (entry as Record<string, unknown>)['mappings'];
    if (!mappings || typeof mappings !== 'object') continue;
    const properties = (mappings as Record<string, unknown>)['properties'];
    if (properties && typeof properties === 'object' && Object.keys(properties).length > 0) {
      return properties as Record<string, MappingProperty>;
    }
  }
  return {};
};

/**
 * Pick the insert template source: mapping-derived skeleton when the index has
 * one, otherwise the given sample row (used when the mapping is empty or the
 * lookup failed). Returns undefined when neither is available.
 */
export const buildInsertTemplateValue = (
  mapping: unknown,
  fallbackRow?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const properties = resolveMappingProperties(mapping);
  if (Object.keys(properties).length > 0) return buildSchemaTemplate(properties);
  return fallbackRow ? buildSampleTemplate(fallbackRow) : undefined;
};

/**
 * Total matching documents from a search response's `hits.total`, which older
 * ES versions return as a plain number and newer ones as `{ value }`.
 */
export const extractHitsTotal = (hitsContainer: unknown): number | undefined => {
  if (!hitsContainer || typeof hitsContainer !== 'object') return undefined;
  const total = (hitsContainer as Record<string, unknown>)['total'];
  if (typeof total === 'number') return total;
  if (total && typeof total === 'object') {
    const value = (total as Record<string, unknown>)['value'];
    if (typeof value === 'number') return value;
  }
  return undefined;
};

/**
 * Distinct index names referenced by the result hits (max 5) — used to fetch
 * mappings for type hints on cluster-wide searches without an index in the
 * query path.
 */
export const collectResultIndices = (hits: unknown[]): string[] => {
  const indices = new Set<string>();
  for (const hit of hits) {
    if (typeof hit !== 'object' || hit === null) continue;
    const idx = (hit as EsSearchHit)._index;
    if (typeof idx === 'string' && idx !== '') indices.add(idx);
  }
  return [...indices].slice(0, 5);
};

/**
 * Merge field types across a multi-index mapping response: the first index
 * that declares a field wins.
 */
export const mergeMappingFieldTypes = (mapping: unknown): Record<string, string> => {
  if (!mapping || typeof mapping !== 'object') return {};
  const merged: Record<string, string> = {};
  for (const entry of Object.values(mapping as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const mappings = (entry as Record<string, unknown>)['mappings'];
    if (!mappings || typeof mappings !== 'object') continue;
    const properties = (mappings as Record<string, unknown>)['properties'];
    if (!properties || typeof properties !== 'object') continue;
    for (const [name, prop] of Object.entries(properties as Record<string, unknown>)) {
      if (merged[name]) continue;
      const type = (prop as Record<string, unknown> | null)?.['type'];
      merged[name] = typeof type === 'string' ? type : 'object';
    }
  }
  return merged;
};
