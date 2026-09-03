import type { ColumnDef } from '@/components/result';
import { inferColumnTypes } from '@/components/result/columnTypes';

export type MongoResultState = {
  documents: Record<string, unknown>[];
  total?: number;
  hasData: boolean;
  error: string | null;
  queryTime?: number;
  collection?: string;
  columns: ColumnDef[];
  executed: boolean;
};

const ACTION_COLUMN_WIDTH = '80px' as const;

/**
 * Normalize a raw Mongo query result into the state shape consumed by
 * ResultPanel. Replicates the legacy logic in index.vue's showResultPanel:
 * arrays map 1:1 to documents, single objects wrap into one document, scalars
 * wrap under a "result" key, and a truthy error short-circuits to an empty
 * error state.
 */
export const normalizeMongoResult = (
  content: unknown,
  error?: string | null,
  queryTime?: number,
  collection?: string,
): MongoResultState => {
  if (error) {
    return {
      documents: [],
      error,
      queryTime,
      collection,
      columns: [],
      executed: true,
      hasData: false,
    };
  }

  let documents: Record<string, unknown>[];
  let total: number;
  let hasData: boolean;

  if (Array.isArray(content)) {
    documents = content as Record<string, unknown>[];
    total = content.length;
    hasData = true;
  } else if (content !== null && content !== undefined && content !== '') {
    // Plain objects (e.g., write acknowledgments like insertOne result) spread
    // their keys as columns so they render in table view. Scalars wrap under a
    // "result" column.
    if (typeof content === 'object') {
      documents = [content as Record<string, unknown>];
    } else {
      documents = [{ result: content }];
    }
    total = 1;
    hasData = true;
  } else {
    documents = [];
    total = 0;
    hasData = false;
  }

  return {
    documents,
    total,
    hasData,
    error: null,
    queryTime,
    collection,
    columns: deriveMongoColumns(documents, !!collection, 'Actions'),
    executed: true,
  };
};

/**
 * Derive table columns from the first 20 documents. Keys are collected in
 * insertion order (never sorted) and an optional trailing actions column is
 * appended when row actions are shown.
 */
export const deriveMongoColumns = (
  documents: Record<string, unknown>[],
  withActions: boolean,
  actionsTitle: string,
): ColumnDef[] => {
  const keys = new Set<string>();
  for (const doc of documents.slice(0, 20)) {
    for (const key of Object.keys(doc)) {
      keys.add(key);
    }
  }
  const typeHints = inferColumnTypes(documents.slice(0, 20));
  const columns: ColumnDef[] = Array.from(keys).map(key => ({
    key,
    title: key,
    dataType: typeHints[key],
  }));
  if (withActions) {
    columns.push({
      key: 'actions',
      title: actionsTitle,
      width: ACTION_COLUMN_WIDTH,
      align: 'center',
      sticky: 'right',
    });
  }
  return columns;
};
