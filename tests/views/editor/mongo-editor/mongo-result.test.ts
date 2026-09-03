import { normalizeMongoResult } from '../../../../src/views/editor/mongo-editor/utils/mongo-result';

describe('normalizeMongoResult', () => {
  it('maps plain arrays one-to-one to documents', () => {
    const state = normalizeMongoResult([{ _id: 'a' }, { _id: 'b' }]);
    expect(state.documents).toHaveLength(2);
    expect(state.total).toBe(2);
    expect(state.truncated).toBeUndefined();
    expect(state.hasData).toBe(true);
  });

  it('unwraps a truncated find payload and keeps the grand total', () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({ _id: String(i) }));
    const state = normalizeMongoResult({ documents: docs, truncated: true, total: 5000 });
    expect(state.documents).toHaveLength(100);
    expect(state.total).toBe(5000);
    expect(state.truncated).toBe(true);
    expect(state.hasData).toBe(true);
  });

  it('falls back to the fetched count when no grand total is available', () => {
    const docs = [{ _id: 'x' }];
    const state = normalizeMongoResult({ documents: docs, truncated: true, total: null });
    expect(state.documents).toHaveLength(1);
    expect(state.total).toBe(1);
    expect(state.truncated).toBe(true);
  });

  it('does not treat ordinary objects with a documents key as truncated', () => {
    const state = normalizeMongoResult({ documents: 1, other: 'x' });
    expect(state.documents).toHaveLength(1);
    expect(state.truncated).toBeUndefined();
  });

  it('keeps write acknowledgments as a single rendered document', () => {
    const state = normalizeMongoResult({ acknowledged: true, insertedId: 'abc' });
    expect(state.documents).toEqual([{ acknowledged: true, insertedId: 'abc' }]);
    expect(state.truncated).toBeUndefined();
  });

  it('short-circuits to an error state when an error is provided', () => {
    const state = normalizeMongoResult(null, 'boom');
    expect(state.documents).toHaveLength(0);
    expect(state.error).toBe('boom');
    expect(state.hasData).toBe(false);
  });
});
