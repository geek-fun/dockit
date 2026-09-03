import {
  resolveEsResultShape,
  buildDocRows,
  buildDocColumns,
  collectResultIndices,
  mergeMappingFieldTypes,
} from '../../../../src/views/editor/es-editor/utils/es-result';

describe('resolveEsResultShape', () => {
  it('returns "text" for plaintext responses (_cat without format=json)', () => {
    expect(resolveEsResultShape('index health status\nidx-1 green open')).toBe('text');
    expect(resolveEsResultShape('')).toBe('text');
  });

  it('returns "docs" for search responses containing hits', () => {
    const response = { took: 5, hits: { total: { value: 2 }, hits: [{ _id: '1', _source: {} }] } };
    expect(resolveEsResultShape(response)).toBe('docs');
  });

  it('returns "docs" for a hitless search without aggregations', () => {
    const response = { took: 3, hits: { total: { value: 0 }, hits: [] } };
    expect(resolveEsResultShape(response)).toBe('docs');
  });

  it('returns "json" for a hitless search that carries aggregations', () => {
    const response = {
      took: 10,
      hits: { total: { value: 0 }, hits: [] },
      aggregations: { avg_price: { value: 42 } },
    };
    expect(resolveEsResultShape(response)).toBe('json');
  });

  it('returns "json" for aggregation-only search responses', () => {
    const response = {
      took: 10,
      hits: { hits: [], max_score: null },
      aggregations: { by_status: { buckets: [] } },
    };
    expect(resolveEsResultShape(response)).toBe('json');
  });

  it('returns "json" for ES error envelopes returned by client (400/404 bodies)', () => {
    const response = {
      error: { type: 'index_not_found_exception', reason: 'no such index' },
      status: 404,
    };
    expect(resolveEsResultShape(response)).toBe('json');
  });

  it('returns "json" for mappings/settings/bulk/_update_by_query payloads', () => {
    expect(resolveEsResultShape({ properties: { title: { type: 'text' } } })).toBe('json');
    expect(resolveEsResultShape({ acknowledged: true })).toBe('json');
    expect(
      resolveEsResultShape({ took: 30, errors: false, items: [{ index: { status: 201 } }] }),
    ).toBe('json');
    expect(resolveEsResultShape([])).toBe('json');
  });

  it('returns "json" for nullish results', () => {
    expect(resolveEsResultShape(undefined)).toBe('json');
    expect(resolveEsResultShape(null)).toBe('json');
  });
});

describe('buildDocRows', () => {
  it('flattens _source onto row root and appends _id', () => {
    const rows = buildDocRows([{ _id: 'a1', _source: { title: 'DocKit', stars: 1200 } }]);
    expect(rows).toEqual([{ title: 'DocKit', stars: 1200, _id: 'a1' }]);
  });

  it('falls back to positional id when hit has none', () => {
    const rows = buildDocRows([{ _source: { title: 'x' } }, { _source: { title: 'y' } }]);
    expect(rows.map(row => row._id)).toEqual(['0', '1']);
  });

  it('treats malformed hits as empty rows instead of crashing', () => {
    expect(buildDocRows([null, undefined])).toEqual([{ _id: '0' }, { _id: '1' }]);
  });

  it('falls back to hit.fields when _source is absent (_source:false searches)', () => {
    const rows = buildDocRows([{ _id: 'a1', fields: { title: ['DocKit'], tags: ['x', 'y'] } }]);
    expect(rows).toEqual([{ title: 'DocKit', tags: ['x', 'y'], _id: 'a1' }]);
  });

  it('prefers _source over hit.fields when both are present', () => {
    const rows = buildDocRows([
      { _id: 'a1', _source: { title: 'fromSource' }, fields: { title: ['fromFields'] } },
    ]);
    expect(rows).toEqual([{ title: 'fromSource', _id: 'a1' }]);
  });
});

describe('buildDocColumns', () => {
  it('puts _id column first and unions+sorts source keys', () => {
    const columns = buildDocColumns([
      { _id: '1', _source: { user: 'ann', price: 9 } },
      { _id: '2', _source: { user: 'bob', tag: 'x' } },
    ]);
    expect(columns.map(column => column.key)).toEqual(['_id', 'price', 'tag', 'user']);
    expect(columns[0].sticky).toBeUndefined();
  });

  it('renders _id without wrapping: fixed min width + ellipsis', () => {
    const columns = buildDocColumns([{ _id: '1', _source: { note: 'n' } }]);
    expect(columns[0].ellipsis).toBe(true);
    expect(columns[0].width).toBe(140);
  });

  it('enables ellipsis for source fields', () => {
    const columns = buildDocColumns([{ _id: '1', _source: { note: 'n' } }]);
    expect(columns[1].ellipsis).toBe(true);
  });

  it('keeps only the _id column when hits carry no source keys', () => {
    expect(buildDocColumns([{ _id: '1' }]).map(column => column.key)).toEqual(['_id']);
  });

  it('derives columns from hit.fields when _source is absent', () => {
    const columns = buildDocColumns([{ _id: '1', fields: { title: ['DocKit'] } }]);
    expect(columns.map(column => column.key)).toEqual(['_id', 'title']);
  });

  it('does not append an actions column by default', () => {
    const columns = buildDocColumns([{ _id: '1', _source: { title: 'x' } }]);
    expect(columns.map(column => column.key)).toEqual(['_id', 'title']);
  });

  it('appends the actions column at the end with title when withActions is true', () => {
    const columns = buildDocColumns([{ _id: '1', _source: { title: 'x' } }], true, 'Actions');
    expect(columns.map(column => column.key)).toEqual(['_id', 'title', 'actions']);
    expect(columns[2].align).toBe('center');
    expect(columns[2].title).toBe('Actions');
    expect(columns[2].sticky).toBe('right');
  });

  it('omits the actions column when withActions is false', () => {
    const columns = buildDocColumns([{ _id: '1', _source: { title: 'x' } }]);
    expect(columns.map(column => column.key)).toEqual(['_id', 'title']);
  });
});

describe('collectResultIndices', () => {
  it('collects distinct _index values from hits', () => {
    const hits = [
      { _index: 'events', _id: '1', _source: {} },
      { _index: 'events', _id: '2', _source: {} },
      { _index: 'orders', _id: '3', _source: {} },
    ];
    expect(collectResultIndices(hits)).toEqual(['events', 'orders']);
  });

  it('skips hits without a usable _index and caps the list at 5', () => {
    const hits = [
      { _source: {} },
      null,
      ...Array.from({ length: 8 }, (_, i) => ({ _index: `idx${i}` })),
    ];
    const indices = collectResultIndices(hits);
    expect(indices).toHaveLength(5);
  });
});

describe('mergeMappingFieldTypes', () => {
  it('merges field types across a multi-index mapping response', () => {
    const mapping = {
      events: { mappings: { properties: { title: { type: 'text' }, capacity: { type: 'long' } } } },
      orders: {
        mappings: { properties: { title: { type: 'keyword' }, total: { type: 'integer' } } },
      },
    };
    expect(mergeMappingFieldTypes(mapping)).toEqual({
      title: 'text',
      capacity: 'long',
      total: 'integer',
    });
  });

  it('labels property-less objects as object and degrades malformed responses', () => {
    expect(
      mergeMappingFieldTypes({ idx: { mappings: { properties: { meta: { properties: {} } } } } }),
    ).toEqual({
      meta: 'object',
    });
    expect(mergeMappingFieldTypes(undefined)).toEqual({});
    expect(mergeMappingFieldTypes({ status: 403 })).toEqual({});
  });
});
