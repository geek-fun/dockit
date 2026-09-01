import { jsonify } from '../../common';

export type ResultExportFormat = 'json' | 'csv';

const FORMULA_PREFIX = /^[=+\-@]/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const neutralizeFormula = (value: string): string =>
  FORMULA_PREFIX.test(value) ? `'${value}` : value;

const csvEscape = (value: string): string => {
  const safe = neutralizeFormula(value);
  return safe.includes(',') || safe.includes('"') || safe.includes('\n')
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
};

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return jsonify.stringify(value);
  return String(value);
};

const toCsv = (rows: Record<string, unknown>[]): string => {
  const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const header = keys.map(csvEscape).join(',');
  const body = rows.map(row => keys.map(key => csvEscape(formatCell(row[key]))).join(','));
  return [header, ...body].join('\n');
};

const toRows = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value)) return [value];
  return [];
};

export const toJsonText = (value: unknown): string =>
  typeof value === 'string' ? value : jsonify.stringify(value, null, 2);

export const serialize = (value: unknown, format: ResultExportFormat): string =>
  format === 'csv' ? toCsv(toRows(value)) : toJsonText(value);

export const extensionOf = (format: ResultExportFormat): string =>
  format === 'csv' ? 'csv' : 'json';
