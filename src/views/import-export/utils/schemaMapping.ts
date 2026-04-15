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
  const properties: Record<string, { type: string }> = {};

  if (metadata?.schema?.properties) {
    for (const [fieldName, fieldInfo] of Object.entries(metadata.schema.properties)) {
      const rawType = (fieldInfo as { type?: string }).type ?? 'TEXT';
      properties[fieldName] = { type: inferredTypeToEsType(rawType, overrides[fieldName]) };
    }
  }

  return JSON.stringify({ mappings: { properties } });
};
