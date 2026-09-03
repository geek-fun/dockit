import {
  dataTypeBucket,
  dataTypeClass,
  inferColumnTypes,
} from '../../../src/components/result/columnTypes';

describe('inferColumnTypes', () => {
  it('labels each key by the first non-null value type', () => {
    const rows = [
      { name: 'ann', age: 30, active: true, meta: { a: 1 }, tags: ['x'], note: null as unknown },
    ];
    expect(inferColumnTypes(rows)).toEqual({
      name: 'string',
      age: 'number',
      active: 'boolean',
      meta: 'object',
      tags: 'array',
    });
  });

  it('labels a key once a later row provides a value', () => {
    const rows = [{ note: null as unknown }, { note: 'text' }];
    expect(inferColumnTypes(rows)).toEqual({ note: 'string' });
  });

  it('skips null and undefined values when deciding a type', () => {
    const rows = [{ a: null }, { a: undefined }, { a: 5 }];
    expect(inferColumnTypes(rows)).toEqual({ a: 'number' });
  });

  it('returns an empty map for rows without values', () => {
    expect(inferColumnTypes([{}, { b: null }])).toEqual({});
    expect(inferColumnTypes([])).toEqual({});
  });

  it('distinguishes nested objects from arrays', () => {
    const rows = [{ list: [1], obj: { k: 1 } }];
    expect(inferColumnTypes(rows)).toEqual({ list: 'array', obj: 'object' });
  });
});

describe('dataTypeBucket / dataTypeClass', () => {
  it('buckets ES mapping types and inferred JS types alike', () => {
    expect(dataTypeBucket('text')).toBe('string');
    expect(dataTypeBucket('keyword')).toBe('string');
    expect(dataTypeBucket('long')).toBe('number');
    expect(dataTypeBucket('double')).toBe('number');
    expect(dataTypeBucket('date')).toBe('date');
    expect(dataTypeBucket('boolean')).toBe('boolean');
    expect(dataTypeBucket('nested')).toBe('object');
    expect(dataTypeBucket('string')).toBe('string');
    expect(dataTypeBucket('ip')).toBe('string');
    expect(dataTypeBucket('geo_point')).toBeUndefined();
  });

  it('maps buckets to distinct color classes with dark variants', () => {
    expect(dataTypeClass('text')).toContain('text-sky-600');
    expect(dataTypeClass('long')).toContain('text-amber-600');
    expect(dataTypeClass('boolean')).toContain('text-violet-600');
    expect(dataTypeClass('date')).toContain('text-emerald-600');
    expect(dataTypeClass('nested')).toContain('text-rose-600');
    expect(dataTypeClass('geo_point')).toBe('');
  });
});
