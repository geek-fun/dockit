import { jsonify } from '@/common';
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

// IPC args go through JSON.stringify, which throws on bigint. Numeric keys also
// need their exact decimal text, and Rust accepts N as a string.
const keyValue = (value: unknown, type: string): DynamoKey['value'] =>
  type === 'N' && (typeof value === 'number' || typeof value === 'bigint')
    ? String(value)
    : (value as DynamoKey['value']);

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
    const type = partitionKeyType || 'S';
    keys.push({ key: partitionKeyName, type, value: keyValue(row[partitionKeyName], type) });
  }
  if (sortKeyName && sortKeyType && row[sortKeyName] !== undefined) {
    keys.push({
      key: sortKeyName,
      type: sortKeyType,
      value: keyValue(row[sortKeyName], sortKeyType),
    });
  }
  return keys;
};

export const formatDynamoCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return jsonify.stringify(value);
  return String(value);
};
