import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { jsonify } from '@/common';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';

export type ResultExportFormat = 'json' | 'csv';

const csvEscape = (value: string): string =>
  value.includes(',') || value.includes('"') || value.includes('\n')
    ? `"${value.replace(/"/g, '""')}"`
    : value;

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

const toJson = (rows: Record<string, unknown>[]): string => jsonify.stringify(rows, null, 2);

const toRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const serialize = (value: unknown, format: ResultExportFormat): string => {
  const rows = toRows(value);
  return format === 'csv' ? toCsv(rows) : toJson(rows);
};

const extensionOf = (format: ResultExportFormat): string => (format === 'csv' ? 'csv' : 'json');

/**
 * Copy / export helpers shared by result panels (ES, Mongo, Dynamo, docs browser).
 * - `copyResult` serialises the value to JSON or CSV and writes it to the clipboard.
 * - `exportResult` opens a native save dialog and writes the value to a file.
 */
export const useResultExport = () => {
  const lang = useLang();
  const message = useMessageService();

  const copyResult = async (value: unknown, format: ResultExportFormat = 'json') => {
    try {
      await navigator.clipboard.writeText(serialize(value, format));
      message.success(lang.t('editor.copySuccess'));
    } catch (err) {
      message.error(`${lang.t('editor.copyFailure')}: ${String(err)}`);
    }
  };

  const exportResult = async (
    value: unknown,
    format: ResultExportFormat = 'json',
    defaultName = 'result',
  ) => {
    try {
      const path = await save({
        defaultPath: `${defaultName}.${extensionOf(format)}`,
        filters: [{ name: format.toUpperCase(), extensions: [extensionOf(format)] }],
      });
      if (!path) return;
      await writeTextFile(path, serialize(value, format));
      message.success(lang.t('editor.exportSuccess'));
    } catch (err) {
      message.error(`${lang.t('editor.exportFailure')}: ${String(err)}`);
    }
  };

  return { copyResult, exportResult };
};
