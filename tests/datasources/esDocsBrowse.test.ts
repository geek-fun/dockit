import {
  buildDocsBrowseQuery,
  extractDocsBrowseFields,
  mergeBrowseFieldsWithHitKeys,
  resolveAggField,
  type DocsBrowseFieldMeta,
} from '../../src/datasources/esDocsBrowse.ts';

const sampleFields: DocsBrowseFieldMeta[] = [
  { name: 'category', kind: 'keyword', aggField: 'category', searchField: 'category' },
  { name: 'title', kind: 'text', aggField: 'title.keyword', searchField: 'title' },
  { name: 'count', kind: 'number', aggField: 'count', searchField: 'count' },
  { name: 'active', kind: 'boolean', aggField: 'active', searchField: 'active' },
];

describe('extractDocsBrowseFields', () => {
  it('classifies keyword, text, number, boolean and skips unsupported', () => {
    const mapping = {
      'my-index': {
        mappings: {
          properties: {
            category: { type: 'keyword' },
            title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            count: { type: 'long' },
            active: { type: 'boolean' },
            createdAt: { type: 'date' },
            nestedDoc: { type: 'object', properties: { a: { type: 'keyword' } } },
          },
        },
      },
    };

    const fields = extractDocsBrowseFields(mapping, 'my-index');
    expect(fields.map(f => f.name)).toEqual(['active', 'category', 'count', 'title']);
    expect(fields.find(f => f.name === 'title')).toMatchObject({
      kind: 'text',
      aggField: 'title.keyword',
    });
    expect(fields.find(f => f.name === 'count')?.kind).toBe('number');
    expect(fields.find(f => f.name === 'createdAt')).toBeUndefined();
  });

  it('reads properties from first index when indexName omitted', () => {
    const mapping = {
      other: {
        mappings: {
          properties: {
            status: { type: 'keyword' },
          },
        },
      },
    };

    const fields = extractDocsBrowseFields(mapping);
    expect(fields).toEqual([
      { name: 'status', kind: 'keyword', aggField: 'status', searchField: 'status' },
    ]);
  });
  it('reads properties from mapping.properties and mappings.properties shapes', () => {
    expect(
      extractDocsBrowseFields({
        properties: { tag: { type: 'keyword' } },
      }),
    ).toEqual([{ name: 'tag', kind: 'keyword', aggField: 'tag', searchField: 'tag' }]);

    expect(
      extractDocsBrowseFields({
        mappings: { properties: { flag: { type: 'boolean' } } },
      }),
    ).toEqual([{ name: 'flag', kind: 'boolean', aggField: 'flag', searchField: 'flag' }]);
  });

  it('treats untyped leaves as keyword', () => {
    const fields = extractDocsBrowseFields({
      properties: { mystery: {} },
    });
    expect(fields).toEqual([
      { name: 'mystery', kind: 'keyword', aggField: 'mystery', searchField: 'mystery' },
    ]);
  });
});

describe('resolveAggField', () => {
  it('returns _id for _id', () => {
    expect(resolveAggField(sampleFields, '_id')).toBe('_id');
  });

  it('returns aggField from meta or null when missing', () => {
    expect(resolveAggField(sampleFields, 'title')).toBe('title.keyword');
    expect(resolveAggField(sampleFields, 'missing')).toBeNull();
  });
});

describe('mergeBrowseFieldsWithHitKeys', () => {
  it('marks unknown hit keys as unsupported display-only fields', () => {
    const merged = mergeBrowseFieldsWithHitKeys(sampleFields, ['category', 'createdAt', '@timestamp']);
    expect(merged.find(f => f.name === 'category')?.kind).toBe('keyword');
    expect(merged.find(f => f.name === 'createdAt')).toEqual({
      name: 'createdAt',
      kind: 'unsupported',
      aggField: null,
      searchField: 'createdAt',
    });
  });
});

describe('buildDocsBrowseQuery', () => {
  it('returns undefined when no text and no filters', () => {
    expect(
      buildDocsBrowseQuery({
        text: '   ',
        textColumn: '__all__',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toBeUndefined();
  });

  it('builds _id wildcard search', () => {
    const query = buildDocsBrowseQuery({
      text: 'abc',
      textColumn: '_id',
      columnFilters: [],
      fields: sampleFields,
    });
    expect(query).toEqual({
      bool: {
        must: [
          {
            wildcard: {
              _id: { value: '*abc*', case_insensitive: true },
            },
          },
        ],
      },
    });
  });

  it('builds All search with text multi_match, keyword wildcards, and number terms', () => {
    const query = buildDocsBrowseQuery({
      text: '4',
      textColumn: '__all__',
      columnFilters: [],
      fields: sampleFields,
    });

    const should = (query as { bool: { must: Array<{ bool: { should: unknown[] } }> } }).bool
      .must[0].bool.should;

    expect(should).toEqual(
      expect.arrayContaining([
        {
          wildcard: {
            _id: { value: '*4*', case_insensitive: true },
          },
        },
        {
          multi_match: {
            query: '4',
            fields: ['title'],
            type: 'best_fields',
            lenient: true,
          },
        },
        {
          wildcard: {
            category: { value: '*4*', case_insensitive: true },
          },
        },
        { term: { count: 4 } },
      ]),
    );
    expect(should).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          multi_match: expect.objectContaining({ fields: expect.arrayContaining(['category']) }),
        }),
      ]),
    );
  });

  it('adds boolean term in All search for true/false', () => {
    const query = buildDocsBrowseQuery({
      text: 'TRUE',
      textColumn: '__all__',
      columnFilters: [],
      fields: sampleFields,
    });
    const should = (query as { bool: { must: Array<{ bool: { should: unknown[] } }> } }).bool
      .must[0].bool.should;
    expect(should).toEqual(expect.arrayContaining([{ term: { active: true } }]));
  });

  it('builds single-column keyword and number clauses', () => {
    expect(
      buildDocsBrowseQuery({
        text: 'Bulk',
        textColumn: 'category',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: {
        must: [
          {
            wildcard: {
              category: { value: '*Bulk*', case_insensitive: true },
            },
          },
        ],
      },
    });

    expect(
      buildDocsBrowseQuery({
        text: '12',
        textColumn: 'count',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: {
        must: [{ term: { count: 12 } }],
      },
    });
  });

  it('builds single-column boolean, text, unknown, and non-numeric number paths', () => {
    expect(
      buildDocsBrowseQuery({
        text: 'true',
        textColumn: 'active',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: { must: [{ term: { active: true } }] },
    });

    expect(
      buildDocsBrowseQuery({
        text: 'maybe',
        textColumn: 'active',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: { must: [{ match: { active: 'maybe' } }] },
    });

    expect(
      buildDocsBrowseQuery({
        text: 'hello',
        textColumn: 'title',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: {
        must: [
          {
            query_string: {
              query: '*hello*',
              fields: ['title', 'title.keyword'],
              analyze_wildcard: true,
              lenient: true,
            },
          },
        ],
      },
    });

    expect(
      buildDocsBrowseQuery({
        text: 'abc',
        textColumn: 'count',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: { must: [{ match: { count: 'abc' } }] },
    });

    expect(
      buildDocsBrowseQuery({
        text: 'x',
        textColumn: 'unknownField',
        columnFilters: [],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: {
        must: [
          {
            query_string: {
              query: '*x*',
              default_field: 'unknownField',
              analyze_wildcard: true,
              lenient: true,
            },
          },
        ],
      },
    });
  });

  it('combines text with column filter terms', () => {
    const query = buildDocsBrowseQuery({
      text: 'x',
      textColumn: 'category',
      columnFilters: [{ field: 'active', values: [true] }],
      fields: sampleFields,
    });

    expect(query).toEqual({
      bool: {
        must: [
          {
            wildcard: {
              category: { value: '*x*', case_insensitive: true },
            },
          },
        ],
        filter: [{ terms: { active: [true] } }],
      },
    });
  });

  it('builds filter-only query', () => {
    expect(
      buildDocsBrowseQuery({
        text: '',
        textColumn: '__all__',
        columnFilters: [{ field: '_id', values: ['a', 'b'] }],
        fields: sampleFields,
      }),
    ).toEqual({
      bool: {
        filter: [{ terms: { _id: ['a', 'b'] } }],
      },
    });
  });
});
