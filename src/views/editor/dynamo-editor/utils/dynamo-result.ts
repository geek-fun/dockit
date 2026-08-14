import type { ColumnDef } from '@/components/result';
import type { DataTableColumn } from '@/types';

/**
 * Flatten DynamoDB columns for the shared ResultPanel.
 * DynamoDB builds a "Primary Key" group column with partition/sort key
 * children; the shared panel's ColumnDef has no children support, so we
 * unroll groups into flat columns here.
 */
export const flattenDynamoColumns = (columns: DataTableColumn[]): ColumnDef[] => {
  const result: ColumnDef[] = [];
  for (const col of columns) {
    if (col.children && col.children.length > 0) {
      result.push(...col.children.map(toColumnDef));
    } else {
      result.push(toColumnDef(col));
    }
  }
  return result;
};

const toColumnDef = (col: DataTableColumn): ColumnDef => ({
  key: col.key,
  title: typeof col.title === 'string' ? col.title : col.key,
  width: col.width ?? col.minWidth,
  align: col.align,
  ellipsis: !!col.ellipsis,
  sticky: col.fixed === 'left' ? 'left' : undefined,
});

export type DynamoKey = { key: string; value: string | number | boolean | null; type: string };

/** Build DynamoDB key(s) from a result row for delete/edit operations. */
export const buildDynamoKeys = (
  row: Record<string, unknown>,
  partitionKeyName: string,
  partitionKeyType: string,
  sortKeyName?: string,
  sortKeyType?: string,
): DynamoKey[] => {
  const keys: DynamoKey[] = [];
  if (partitionKeyName && row[partitionKeyName] !== undefined) {
    keys.push({
      key: partitionKeyName,
      value: row[partitionKeyName] as DynamoKey['value'],
      type: partitionKeyType || 'S',
    });
  }
  if (sortKeyName && sortKeyType && row[sortKeyName] !== undefined) {
    keys.push({
      key: sortKeyName,
      value: row[sortKeyName] as DynamoKey['value'],
      type: sortKeyType,
    });
  }
  return keys;
};

export const formatDynamoCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
