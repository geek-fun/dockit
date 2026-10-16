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

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const hasCanonicalTrailingBits = (padded: string): boolean => {
  const padding = padded.endsWith('==') ? 2 : padded.endsWith('=') ? 1 : 0;
  if (padding === 0) return true;
  const last = BASE64_ALPHABET.indexOf(padded[padded.length - padding - 1]);
  return padding === 2 ? (last & 0b1111) === 0 : (last & 0b11) === 0;
};

// Mirrors the Rust `general_purpose::STANDARD` decoder used by convert_json_to_attr_value.
// An empty string is valid: DynamoDB allows empty binary values inside a set.
const isCanonicalBase64 = (value: string): boolean => {
  const trimmed = value.trim();
  return BASE64_PATTERN.test(trimmed) && hasCanonicalTrailingBits(trimmed);
};

// Mirrors the Rust i64-then-f64 parse, minus the non-finite values Rust would pass through.
const isNumericString = (value: string): boolean => {
  const trimmed = value.trim();
  return DECIMAL_PATTERN.test(trimmed) && Number.isFinite(Number(trimmed));
};

const hasNonFiniteNumber = (value: unknown): boolean => {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasNonFiniteNumber);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(hasNonFiniteNumber);
  }
  return false;
};

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

  // JSON.parse turns an overflowing literal (1e400) into Infinity, which JSON.stringify
  // would silently rewrite as null and change the stored value.
  if (hasNonFiniteNumber(parsed)) return { kind: 'shape' };

  if (attributeType === 'M') {
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? null
      : { kind: 'shape' };
  }

  if (!Array.isArray(parsed)) return { kind: 'shape' };
  if (attributeType === 'L') return null;
  if (parsed.length === 0) return { kind: 'emptySet' };

  if (attributeType === 'SS') {
    // Empty string values are allowed inside a set; only the set itself cannot be empty.
    return parsed.every(item => typeof item === 'string') ? null : { kind: 'shape' };
  }
  if (attributeType === 'NS') {
    return parsed.every(
      item =>
        (typeof item === 'number' && Number.isFinite(item)) ||
        (typeof item === 'string' && isNumericString(item)),
    )
      ? null
      : { kind: 'shape' };
  }
  return parsed.every(item => typeof item === 'string' && isCanonicalBase64(item))
    ? null
    : { kind: 'shape' };
};

export type TableKeyLabels = {
  partitionKeyName?: string;
  sortKeyName?: string;
  partitionKeyLabel?: string;
  sortKeyLabel?: string;
};

type TableKeyLike = { name?: string };

export const resolveTableKeyLabels = (table?: {
  partitionKey?: TableKeyLike;
  sortKey?: TableKeyLike;
}): TableKeyLabels => {
  const partitionKeyName = table?.partitionKey?.name;
  const sortKeyName = table?.sortKey?.name;

  return {
    partitionKeyName,
    sortKeyName,
    partitionKeyLabel: partitionKeyName ? `${partitionKeyName}  (Partition Key):` : undefined,
    sortKeyLabel: sortKeyName ? `${sortKeyName} (Sort Key):` : undefined,
  };
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
