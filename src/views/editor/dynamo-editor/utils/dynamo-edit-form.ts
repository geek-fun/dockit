import { jsonify } from '@/common';
import type { DynamoAttributeItem } from '@/datasources';

export const changedDynamoAttributes = (
  attributes: DynamoAttributeItem[],
  original: DynamoAttributeItem[],
): DynamoAttributeItem[] =>
  attributes.filter(
    attr =>
      !original.some(
        previous =>
          previous.key === attr.key && previous.type === attr.type && previous.value === attr.value,
      ),
  );

/**
 * Names deleted from the form. Renaming an attribute removes its previous name
 * and sets the new one.
 */
export const removedDynamoAttributes = (
  attributes: DynamoAttributeItem[],
  original: DynamoAttributeItem[],
): string[] =>
  original.map(attr => attr.key).filter(key => !attributes.some(attr => attr.key === key));

const inferType = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'string') return 'S';
  if (typeof value === 'number' || typeof value === 'bigint') return 'N';
  if (typeof value === 'boolean') return 'BOOL';
  return Array.isArray(value) ? 'L' : 'M';
};

export const buildDynamoEditForm = (
  item: Record<string, unknown>,
  attributeTypes: Record<string, string>,
  keys: { name: string; type: string }[],
): { keys: DynamoAttributeItem[]; attributes: DynamoAttributeItem[] } => {
  const entries = Object.entries(item)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const type =
        keys.find(entry => entry.name === key)?.type || attributeTypes[key] || inferType(value);
      const formatted =
        type === 'NULL'
          ? null
          : type === 'BOOL'
            ? (value as boolean)
            : ['SS', 'NS', 'BS', 'L', 'M'].includes(type)
              ? jsonify.stringify(value)
              : String(value ?? '');
      return { key, type, value: formatted };
    });
  return {
    keys: entries.filter(entry => keys.some(key => key.name === entry.key)),
    attributes: entries.filter(entry => !keys.some(key => key.name === entry.key)),
  };
};
