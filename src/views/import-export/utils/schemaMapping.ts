import type { ImportMetadata } from '../../../store';

const INFERRED_TO_ES_TYPE: Record<string, string> = {
  TEXT: 'text',
  KEYWORD: 'keyword',
  INTEGER: 'long',
  FLOAT: 'float',
  DOUBLE: 'double',
  DATE: 'date',
  BOOLEAN: 'boolean',
  OBJECT: 'object',
  ARRAY: 'nested',
  NULL: 'keyword',
};

export const inferredTypeToEsType = (inferredType: string, override?: string): string =>
  override ?? INFERRED_TO_ES_TYPE[inferredType.toUpperCase()] ?? 'keyword';

export const buildEsMappingBody = (
  metadata: ImportMetadata | null,
  overrides: Record<string, string>,
): string => {
  const properties: Record<string, unknown> = {};

  if (metadata?.schema?.properties) {
    for (const [fieldName, fieldInfo] of Object.entries(metadata.schema.properties)) {
      const info = fieldInfo as Record<string, unknown>;

      if (overrides[fieldName]) {
        properties[fieldName] = { type: overrides[fieldName] };
      } else if (!info.type && info.properties) {
        properties[fieldName] = info;
      } else {
        const rawType = (info.type as string) ?? 'TEXT';
        const inferredEsType = INFERRED_TO_ES_TYPE[rawType.toUpperCase()];
        properties[fieldName] = inferredEsType ? { type: inferredEsType } : info;
      }
    }
  }

  return JSON.stringify({ mappings: { properties } });
};
