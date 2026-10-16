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

export type StructuredValueIssue =
  | { kind: 'syntax'; reason: string }
  | { kind: 'shape' }
  | { kind: 'emptySet' };

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export const validateStructuredValue = (
  attributeType: string,
  text: string,
): StructuredValueIssue | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { kind: 'syntax', reason: (error as Error).message };
  }

  if (attributeType === 'M') {
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? null
      : { kind: 'shape' };
  }

  if (!Array.isArray(parsed)) return { kind: 'shape' };
  if (attributeType === 'L') return null;
  if (parsed.length === 0) return { kind: 'emptySet' };

  if (attributeType === 'SS') {
    return parsed.every(item => typeof item === 'string') ? null : { kind: 'shape' };
  }
  if (attributeType === 'NS') {
    return parsed.every(
      item =>
        typeof item === 'number' ||
        (typeof item === 'string' && item.trim() !== '' && !Number.isNaN(Number(item))),
    )
      ? null
      : { kind: 'shape' };
  }
  return parsed.every(item => typeof item === 'string' && BASE64_PATTERN.test(item.trim()))
    ? null
    : { kind: 'shape' };
};

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
