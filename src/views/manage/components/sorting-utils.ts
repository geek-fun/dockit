import type { ClusterIndex, ClusterAlias, ClusterTemplate } from '../../../datasources';

export type SortDirection = 'asc' | 'desc';

export type IndexSortColumn = 'index' | 'health' | 'status' | 'docs' | 'storage';
export type TemplateSortColumn =
  | 'name'
  | 'type'
  | 'precedence'
  | 'version'
  | 'mappings'
  | 'settings';

export type IndexWithAliases = ClusterIndex & { aliases: ClusterAlias[] };
export type TemplateItem = ClusterTemplate;

export const healthOrder = (health: string): number => {
  if (health === 'green') return 0;
  if (health === 'yellow') return 1;
  return 2;
};

export const statusOrder = (status: string): number => (status === 'open' ? 0 : 1);

export const parseStorageBytes = (storage: string | undefined | null): number => {
  if (!storage) return 0;
  const match = storage.match(/([0-9.]+)\s*([a-zA-Z]+)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  return value * (multipliers[unit] ?? 1);
};

export const compareNullLast = <T>(
  a: T | null | undefined,
  b: T | null | undefined,
  cmp: number,
): number => {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return cmp;
};

export const indexComparators: Record<
  IndexSortColumn,
  (a: IndexWithAliases, b: IndexWithAliases) => number
> = {
  index: (a, b) => a.index.localeCompare(b.index),
  health: (a, b) => healthOrder(a.health) - healthOrder(b.health),
  status: (a, b) => statusOrder(a.status) - statusOrder(b.status),
  docs: (a, b) =>
    compareNullLast(a.docs?.count, b.docs?.count, (a.docs?.count ?? 0) - (b.docs?.count ?? 0)),
  storage: (a, b) => parseStorageBytes(a.storage) - parseStorageBytes(b.storage),
};

export const templateComparators: Record<
  TemplateSortColumn,
  (a: TemplateItem, b: TemplateItem) => number
> = {
  name: (a, b) => a.name.localeCompare(b.name),
  type: (a, b) => a.type.localeCompare(b.type),
  precedence: (a, b) =>
    compareNullLast(a.precedence, b.precedence, (a.precedence ?? 0) - (b.precedence ?? 0)),
  version: (a, b) => compareNullLast(a.version, b.version, (a.version ?? 0) - (b.version ?? 0)),
  mappings: (a, b) =>
    compareNullLast(
      a.mapping_count,
      b.mapping_count,
      (a.mapping_count ?? 0) - (b.mapping_count ?? 0),
    ),
  settings: (a, b) =>
    compareNullLast(
      a.settings_count,
      b.settings_count,
      (a.settings_count ?? 0) - (b.settings_count ?? 0),
    ),
};
