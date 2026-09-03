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
