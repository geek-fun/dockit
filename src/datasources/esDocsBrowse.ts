export type DocsBrowseFieldKind = 'keyword' | 'text' | 'boolean' | 'number' | 'unsupported';

export type DocsBrowseFieldMeta = {
  name: string;
  kind: DocsBrowseFieldKind;
  /** Field path to use for terms aggregations / term filters (e.g. `status.keyword`) */
  aggField: string | null;
  /** Field path to use for full-text match (e.g. `title` for text) */
  searchField: string;
};

export type DocsBrowseColumnFilter = {
  field: string;
  values: Array<string | number | boolean>;
};

export type DocsBrowseQueryInput = {
  text: string;
  /** `'__all__'` or a field name */
  textColumn: string;
  columnFilters: DocsBrowseColumnFilter[];
  fields: DocsBrowseFieldMeta[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SCALAR_TYPES = new Set([
  'keyword',
  'text',
  'match_only_text',
  'boolean',
  'long',
  'integer',
  'short',
  'byte',
  'double',
  'float',
  'half_float',
  'scaled_float',
  'unsigned_long',
]);

const NUMBER_TYPES = new Set([
  'long',
  'integer',
  'short',
  'byte',
  'double',
  'float',
  'half_float',
  'scaled_float',
  'unsigned_long',
]);

const extractProperties = (mapping: unknown, indexName?: string): Record<string, unknown> => {
  if (!isRecord(mapping)) return {};

  if (indexName && isRecord(mapping[indexName])) {
    const indexMapping = mapping[indexName];
    const mappings = isRecord(indexMapping.mappings) ? indexMapping.mappings : indexMapping;
    if (isRecord(mappings.properties)) return mappings.properties;
  }

  const firstIndex = Object.values(mapping).find(isRecord);
  if (firstIndex) {
    const mappings = isRecord(firstIndex.mappings) ? firstIndex.mappings : firstIndex;
    if (isRecord(mappings.properties)) return mappings.properties as Record<string, unknown>;
  }

  if (isRecord(mapping.properties)) return mapping.properties;
  if (isRecord(mapping.mappings) && isRecord(mapping.mappings.properties)) {
    return mapping.mappings.properties;
  }

  return {};
};

const resolveFieldMeta = (name: string, prop: Record<string, unknown>): DocsBrowseFieldMeta => {
  const type = typeof prop.type === 'string' ? prop.type : undefined;
  const fields = isRecord(prop.fields) ? prop.fields : undefined;
  const hasKeywordSubfield =
    fields !== undefined &&
    Object.entries(fields).some(
      ([subName, subProp]) =>
        subName === 'keyword' || (isRecord(subProp) && subProp.type === 'keyword'),
    );

  if (type === 'boolean') {
    return { name, kind: 'boolean', aggField: name, searchField: name };
  }

  if (type && NUMBER_TYPES.has(type)) {
    return { name, kind: 'number', aggField: name, searchField: name };
  }

  if (type === 'keyword' || type === 'constant_keyword' || type === 'wildcard') {
    return { name, kind: 'keyword', aggField: name, searchField: name };
  }

  if (type === 'text' || type === 'match_only_text' || (!type && hasKeywordSubfield)) {
    return {
      name,
      kind: 'text',
      aggField: hasKeywordSubfield ? `${name}.keyword` : null,
      searchField: name,
    };
  }

  // Object / nested / geo / etc.
  if (type === 'object' || type === 'nested' || isRecord(prop.properties)) {
    return { name, kind: 'unsupported', aggField: null, searchField: name };
  }

  if (type && !SCALAR_TYPES.has(type)) {
    return { name, kind: 'unsupported', aggField: null, searchField: name };
  }

  // Untyped leaf — treat as keyword-ish for search only
  return { name, kind: 'keyword', aggField: name, searchField: name };
};

export const extractDocsBrowseFields = (
  mapping: unknown,
  indexName?: string,
): DocsBrowseFieldMeta[] => {
  const properties = extractProperties(mapping, indexName);
  return Object.entries(properties)
    .map(([name, prop]) => (isRecord(prop) ? resolveFieldMeta(name, prop) : null))
    .filter((meta): meta is DocsBrowseFieldMeta => meta !== null && meta.kind !== 'unsupported')
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const resolveAggField = (
  fields: DocsBrowseFieldMeta[],
  fieldName: string,
): string | null => {
  if (fieldName === '_id') return '_id';
  const meta = fields.find(f => f.name === fieldName);
  return meta?.aggField ?? null;
};

const escapeWildcard = (value: string): string => value.replace(/[\\*?]/g, ch => `\\${ch}`);

const buildTextClause = (
  text: string,
  textColumn: string,
  fields: DocsBrowseFieldMeta[],
): Record<string, unknown> | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (textColumn === '_id') {
    return {
      wildcard: {
        _id: { value: `*${escapeWildcard(trimmed)}*`, case_insensitive: true },
      },
    };
  }

  if (textColumn !== '__all__') {
    const meta = fields.find(f => f.name === textColumn);
    if (!meta) {
      return {
        query_string: {
          query: `*${escapeWildcard(trimmed)}*`,
          default_field: textColumn,
          analyze_wildcard: true,
          lenient: true,
        },
      };
    }

    if (meta.kind === 'boolean') {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        return { term: { [meta.searchField]: lower === 'true' } };
      }
      return { match: { [meta.searchField]: trimmed } };
    }

    if (meta.kind === 'number') {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        return { term: { [meta.searchField]: num } };
      }
      return { match: { [meta.searchField]: trimmed } };
    }

    if (meta.kind === 'keyword' && meta.aggField) {
      return {
        wildcard: {
          [meta.aggField]: { value: `*${escapeWildcard(trimmed)}*`, case_insensitive: true },
        },
      };
    }

    return {
      query_string: {
        query: `*${escapeWildcard(trimmed)}*`,
        fields: [meta.searchField, ...(meta.aggField ? [meta.aggField] : [])],
        analyze_wildcard: true,
        lenient: true,
      },
    };
  }

  const should: Record<string, unknown>[] = [
    {
      wildcard: {
        _id: { value: `*${escapeWildcard(trimmed)}*`, case_insensitive: true },
      },
    },
  ];

  const textFields = fields.filter(f => f.kind === 'text').map(f => f.searchField);

  if (textFields.length > 0) {
    should.push({
      multi_match: {
        query: trimmed,
        fields: textFields,
        type: 'best_fields',
        lenient: true,
      },
    });
    should.push({
      query_string: {
        query: `*${escapeWildcard(trimmed)}*`,
        fields: textFields,
        analyze_wildcard: true,
        lenient: true,
      },
    });
  }

  fields
    .filter(f => f.kind === 'keyword' && f.aggField)
    .forEach(f => {
      should.push({
        wildcard: {
          [f.aggField as string]: {
            value: `*${escapeWildcard(trimmed)}*`,
            case_insensitive: true,
          },
        },
      });
    });

  fields
    .filter(f => f.kind === 'boolean')
    .forEach(f => {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === 'false') {
        should.push({ term: { [f.searchField]: lower === 'true' } });
      }
    });

  fields
    .filter(f => f.kind === 'number')
    .forEach(f => {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) {
        should.push({ term: { [f.searchField]: num } });
      }
    });

  return { bool: { should, minimum_should_match: 1 } };
};

const buildColumnFilterClauses = (
  columnFilters: DocsBrowseColumnFilter[],
  fields: DocsBrowseFieldMeta[],
): Record<string, unknown>[] =>
  columnFilters
    .filter(filter => filter.values.length > 0)
    .flatMap(filter => {
      const aggField =
        filter.field === '_id'
          ? '_id'
          : (fields.find(f => f.name === filter.field)?.aggField ?? null);
      if (!aggField) return [];
      return [{ terms: { [aggField]: filter.values } }];
    });

export const buildDocsBrowseQuery = (
  input: DocsBrowseQueryInput,
): Record<string, unknown> | undefined => {
  const must: Record<string, unknown>[] = [];
  const filter = buildColumnFilterClauses(input.columnFilters, input.fields);

  const textClause = buildTextClause(input.text, input.textColumn, input.fields);
  if (textClause) must.push(textClause);

  if (must.length === 0 && filter.length === 0) return undefined;

  return {
    bool: {
      ...(must.length > 0 ? { must } : {}),
      ...(filter.length > 0 ? { filter } : {}),
    },
  };
};

export const mergeBrowseFieldsWithHitKeys = (
  mappingFields: DocsBrowseFieldMeta[],
  hitKeys: string[],
): DocsBrowseFieldMeta[] => {
  const byName = new Map(mappingFields.map(f => [f.name, f]));
  hitKeys.forEach(key => {
    if (byName.has(key)) return;
    // Unknown hit keys stay display-only — never wildcard/terms-search them
    // (they may be dates, numbers, or objects missing from mapping).
    byName.set(key, {
      name: key,
      kind: 'unsupported',
      aggField: null,
      searchField: key,
    });
  });
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
};
