import type { ColumnDef } from '@/components/result';

export type EsResultShape = 'docs' | 'json' | 'text';

type EsSearchHit = {
  _id?: string;
  _source?: Record<string, unknown>;
};

const hitSource = (hit: unknown): Record<string, unknown> | undefined => {
  if (typeof hit !== 'object' || hit === null) return undefined;
  const source = (hit as EsSearchHit)._source;
  return typeof source === 'object' && source !== null ? source : undefined;
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
  hits.map((hit, index) => ({
    ...(hitSource(hit) ?? {}),
    _id:
      typeof hit === 'object' && hit !== null
        ? ((hit as EsSearchHit)._id ?? String(index))
        : String(index),
  }));

/**
 * Derive table columns from search hits: sticky `_id` column first, then the
 * sorted union of `_source` top-level keys. Nested values degrade to JSON
 * strings inside cells, matching how Mongo/Dynamo panels render complex cells.
 */
export const buildDocColumns = (hits: unknown[]): ColumnDef[] => {
  const keys = new Set<string>();
  for (const hit of hits) {
    for (const key of Object.keys(hitSource(hit) ?? {})) keys.add(key);
  }

  return [
    { key: '_id', title: '_id', sticky: 'left' },
    ...Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map(key => ({ key, title: key, ellipsis: true })),
  ];
};
