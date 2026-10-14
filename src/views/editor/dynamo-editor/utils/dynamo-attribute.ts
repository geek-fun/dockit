import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';

export const STRUCTURED_TYPES = ['SS', 'NS', 'BS', 'L', 'M'] as const;

export const isStructuredType = (type: string): boolean =>
  (STRUCTURED_TYPES as readonly string[]).includes(type);

export const TYPE_VALUE_TEMPLATES: Record<string, string> = {
  SS: '["value-1", "value-2"]',
  NS: '[1, 2, 3]',
  BS: '["<base64>"]',
  L: '["string", 123, true, {"nested": "value"}]',
  M: '{"key": "value"}',
};

export const typeValueTemplate = (type: string): string => TYPE_VALUE_TEMPLATES[type] ?? '';

export const pickBinaryFileAsBase64 = async (): Promise<string | null> => {
  const selected = await open({ multiple: false, directory: false });
  if (!selected || Array.isArray(selected)) return null;

  const bytes = await readFile(selected);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};
