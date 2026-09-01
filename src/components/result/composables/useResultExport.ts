import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';
import { serialize, extensionOf, type ResultExportFormat } from '../resultSerialization';

export type { ResultExportFormat };

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
