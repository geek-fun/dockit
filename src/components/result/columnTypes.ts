const labelOf = (value: unknown): string => {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
};

/**
 * Infer a display type per column from schemaless rows (Mongo/Dynamo): the
 * first non-null value of each key decides its label.
 */
export const inferColumnTypes = (rows: Array<Record<string, unknown>>): Record<string, string> => {
  const types: Record<string, string> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (types[key] || value === null || value === undefined) continue;
      types[key] = labelOf(value);
    }
  }
  return types;
};

export type DataTypeBucket = 'string' | 'number' | 'boolean' | 'date' | 'object';

const NUMBER_TYPES = new Set([
  'number',
  'long',
  'integer',
  'short',
  'byte',
  'double',
  'float',
  'half_float',
  'scaled_float',
  'unsigned_long',
]);
const STRING_TYPES = new Set([
  'string',
  'text',
  'keyword',
  'constant_keyword',
  'wildcard',
  'binary',
  'version',
  'ip',
]);
const DATE_TYPES = new Set(['date', 'date_nanos']);

/** Bucket any engine type label (ES mapping type or inferred JS type). */
export const dataTypeBucket = (type?: string): DataTypeBucket | undefined => {
  if (!type) return undefined;
  if (NUMBER_TYPES.has(type)) return 'number';
  if (STRING_TYPES.has(type)) return 'string';
  if (DATE_TYPES.has(type)) return 'date';
  if (type === 'boolean') return 'boolean';
  if (type === 'object' || type === 'nested' || type === 'array') return 'object';
  return undefined;
};

/** Color class per type bucket, consistent across engines and themes. */
export const dataTypeClass = (type?: string): string => {
  switch (dataTypeBucket(type)) {
    case 'string':
      return 'text-sky-600 dark:text-sky-400';
    case 'number':
      return 'text-amber-600 dark:text-amber-400';
    case 'boolean':
      return 'text-violet-600 dark:text-violet-400';
    case 'date':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'object':
      return 'text-rose-600 dark:text-rose-400';
    default:
      return '';
  }
};
