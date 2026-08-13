import { deriveMongoColumns, normalizeMongoResult } from './mongo-result';

describe('normalizeMongoResult', () => {
  it('wraps an array of 3 objects as documents with total 3 and hasData true', () => {
    const result = normalizeMongoResult([{ a: 1 }, { b: 2 }, { c: 3 }]);
    expect(result.documents.length).toBe(3);
    expect(result.total).toBe(3);
    expect(result.hasData).toBe(true);
    expect(result.executed).toBe(true);
  });

  it('wraps a single plain object as one document', () => {
    const result = normalizeMongoResult({ a: 1 });
    expect(result.documents.length).toBe(1);
    expect(result.documents[0].a).toBe(1);
  });

  it('wraps a scalar string under a "result" key', () => {
    const result = normalizeMongoResult('hello');
    expect(result.documents.length).toBe(1);
    expect(result.documents[0].result).toBe('hello');
  });

  it('wraps a scalar number under a "result" key', () => {
    const result = normalizeMongoResult(42);
    expect(result.documents[0].result).toBe(42);
  });

  it('wraps a scalar boolean under a "result" key', () => {
    const result = normalizeMongoResult(true);
    expect(result.documents[0].result).toBe(true);
  });

  it('returns empty documents for null input', () => {
    const result = normalizeMongoResult(null);
    expect(result.documents.length).toBe(0);
    expect(result.hasData).toBe(false);
    expect(result.executed).toBe(true);
  });

  it('returns empty documents for undefined input', () => {
    const result = normalizeMongoResult(undefined);
    expect(result.documents.length).toBe(0);
    expect(result.hasData).toBe(false);
  });

  it('returns empty documents for an empty string input', () => {
    const result = normalizeMongoResult('');
    expect(result.documents.length).toBe(0);
    expect(result.hasData).toBe(false);
  });

  it('short-circuits to an error state when an error is provided', () => {
    const result = normalizeMongoResult({ a: 1 }, 'boom');
    expect(result.error).toBe('boom');
    expect(result.hasData).toBe(false);
    expect(result.documents.length).toBe(0);
  });

  it('passes queryTime and collection through', () => {
    const result = normalizeMongoResult([{ a: 1 }], null, 12, 'users');
    expect(result.queryTime).toBe(12);
    expect(result.collection).toBe('users');
  });

  it('derives columns from the document keys', () => {
    const result = normalizeMongoResult({ a: 1, b: 2 });
    const keys = result.columns.map(column => column.key);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });
});

describe('deriveMongoColumns', () => {
  it('returns an empty column list for no documents', () => {
    expect(deriveMongoColumns([], false, 'Actions')).toEqual([]);
  });

  it('collects keys in insertion order, unsorted', () => {
    const columns = deriveMongoColumns([{ _id: 'x', name: 'y' }], false, 'Actions');
    expect(columns).toEqual([
      { key: '_id', title: '_id' },
      { key: 'name', title: 'name' },
    ]);
  });

  it('preserves insertion order even when keys are not alphabetical', () => {
    const columns = deriveMongoColumns([{ name: 'x', _id: 'y' }], false, 'Actions');
    expect(columns[0].key).toBe('name');
    expect(columns[1].key).toBe('_id');
  });

  it('samples only the first 20 documents for keys', () => {
    const documents = Array.from({ length: 25 }, (_, index) =>
      index === 20 ? { rareKey: 'only-in-doc-20' } : { [`key${index}`]: index },
    );
    const columns = deriveMongoColumns(documents, false, 'Actions');
    const keys = columns.map(column => column.key);
    expect(keys).not.toContain('rareKey');
    expect(keys.length).toBe(20);
  });

  it('unions keys across documents', () => {
    const columns = deriveMongoColumns([{ a: 1 }, { b: 2 }], false, 'Actions');
    expect(columns.map(column => column.key)).toEqual(['a', 'b']);
  });

  it('appends an actions column when withActions is true', () => {
    const columns = deriveMongoColumns([{ a: 1 }], true, 'Ops');
    const last = columns[columns.length - 1];
    expect(last.key).toBe('actions');
    expect(last.title).toBe('Ops');
    expect(last.width).toBe('80px');
  });

  it('omits the actions column when withActions is false', () => {
    const columns = deriveMongoColumns([{ a: 1 }], false, 'Actions');
    expect(columns.some(column => column.key === 'actions')).toBe(false);
  });
});
