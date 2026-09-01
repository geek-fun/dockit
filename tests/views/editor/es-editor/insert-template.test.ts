import {
  buildSchemaTemplate,
  buildSampleTemplate,
  extractDocumentId,
  resolveMappingProperties,
} from '../../../../src/views/editor/es-editor/utils/es-result';

describe('buildSchemaTemplate', () => {
  it('starts text and keyword fields as empty strings', () => {
    expect(
      buildSchemaTemplate({
        title: { type: 'text' },
        status: { type: 'keyword' },
      }),
    ).toEqual({ title: '', status: '' });
  });

  it('starts non-string scalar fields as null', () => {
    expect(
      buildSchemaTemplate({
        count: { type: 'long' },
        score: { type: 'double' },
        active: { type: 'boolean' },
        createdAt: { type: 'date' },
      }),
    ).toEqual({ count: null, score: null, active: null, createdAt: null });
  });

  it('recurses into object properties', () => {
    expect(
      buildSchemaTemplate({
        owner: {
          properties: {
            name: { type: 'keyword' },
            age: { type: 'integer' },
          },
        },
      }),
    ).toEqual({ owner: { name: '', age: null } });
  });

  it('leaves nested and unknown types as null', () => {
    expect(
      buildSchemaTemplate({
        tags: { type: 'nested', properties: { name: { type: 'keyword' } } },
        blob: { type: 'binary' },
      }),
    ).toEqual({ tags: null, blob: null });
  });
});

describe('buildSampleTemplate', () => {
  it('blanks the _id placeholder while keeping other fields', () => {
    expect(buildSampleTemplate({ _id: 'evt-001', name: 'x', count: 2 })).toEqual({
      _id: '',
      name: 'x',
      count: 2,
    });
  });

  it('adds an _id placeholder when the row has none', () => {
    expect(buildSampleTemplate({ name: 'x' })).toEqual({ name: 'x', _id: '' });
  });
});

describe('extractDocumentId', () => {
  it('splits a top-level _id into the addressing id and removes it from the body', () => {
    const { id, body } = extractDocumentId({ _id: 'evt-9', name: 'x' });
    expect(id).toBe('evt-9');
    expect(body).toEqual({ name: 'x' });
  });

  it('returns an empty id for the blank sample placeholder', () => {
    const { id, body } = extractDocumentId({ _id: '', name: 'x' });
    expect(id).toBe('');
    expect(body).toEqual({ name: 'x' });
  });

  it('stringifies numeric ids', () => {
    const { id, body } = extractDocumentId({ _id: 42, name: 'x' });
    expect(id).toBe('42');
    expect(body).toEqual({ name: 'x' });
  });

  it('passes documents without _id through untouched', () => {
    const doc = { name: 'x', meta: { _id: 'nested-not-split' } };
    const { id, body } = extractDocumentId(doc);
    expect(id).toBeUndefined();
    expect(body).toEqual(doc);
  });

  it('degrades non-object input to an empty body', () => {
    expect(extractDocumentId('plain text')).toEqual({ body: {} });
    expect(extractDocumentId(null)).toEqual({ body: {} });
    expect(extractDocumentId([1, 2])).toEqual({ body: {} });
  });
});

describe('resolveMappingProperties', () => {
  it('extracts properties from a single-index mapping response', () => {
    const mapping = {
      'logs-1': { mappings: { properties: { title: { type: 'text' } } } },
    };
    expect(resolveMappingProperties(mapping)).toEqual({ title: { type: 'text' } });
  });

  it('takes the first concrete index that carries properties for wildcard patterns', () => {
    const mapping = {
      'logs-a': { mappings: {} },
      'logs-b': { mappings: { properties: { title: { type: 'text' } } } },
    };
    expect(resolveMappingProperties(mapping)).toEqual({ title: { type: 'text' } });
  });

  it('returns empty properties for malformed or empty responses', () => {
    expect(resolveMappingProperties(undefined)).toEqual({});
    expect(resolveMappingProperties({})).toEqual({});
    expect(resolveMappingProperties({ 'logs-1': { mappings: { properties: {} } } })).toEqual({});
  });
});
