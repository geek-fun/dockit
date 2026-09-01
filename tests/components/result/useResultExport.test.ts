import { serialize, toJsonText } from '../../../src/components/result/resultSerialization';

describe('useResultExport serialization', () => {
  describe('JSON format', () => {
    it('serializes a raw object without flattening to an array', () => {
      const value = { took: 3, hits: { total: 1, hits: [{ _id: 'a', _source: { name: 'x' } }] } };
      expect(JSON.parse(serialize(value, 'json'))).toEqual(value);
    });

    it('preserves a raw string unchanged (text responses)', () => {
      expect(serialize('index health status\nfoo  green  open', 'json')).toBe(
        'index health status\nfoo  green  open',
      );
    });

    it('serializes arrays of rows with indentation', () => {
      const rows = [{ _id: '1', name: 'a' }];
      const out = serialize(rows, 'json');
      expect(JSON.parse(out)).toEqual(rows);
      expect(out).toContain('\n');
    });

    it('does not drop an empty result to undefined', () => {
      expect(serialize([], 'json')).toBe('[]');
    });
  });

  describe('CSV format', () => {
    it('escapes fields containing commas, quotes and newlines', () => {
      const out = serialize([{ name: 'a, b', note: 'say "hi"\nline2' }], 'csv');
      expect(out.split('\n')).toHaveLength(3);
      expect(out).toContain('"a, b"');
      expect(out).toContain('"say ""hi""\nline2"');
    });

    it('does not crash on null or primitive array members', () => {
      const out = serialize([{ a: 1 }, null, 42, 'x'] as unknown, 'csv');
      expect(out.split('\n')[0]).toBe('a');
      expect(out).not.toContain('null');
    });

    it('neutralizes spreadsheet formula injection in cells', () => {
      const out = serialize([{ value: '=HYPERLINK("https://evil.example","x")' }], 'csv');
      expect(out).toContain("'=HYPERLINK");
    });

    it('neutralizes spreadsheet formula injection in headers', () => {
      const out = serialize([{ '=cmd': 1 }] as unknown, 'csv');
      expect(out.split('\n')[0]).toBe("'=cmd");
    });

    it('produces a header-only CSV for a single object (one row)', () => {
      const out = serialize({ name: 'x', age: 2 }, 'csv');
      expect(out.split('\n')).toEqual(['name,age', 'x,2']);
    });
  });

  describe('toJsonText', () => {
    it('pretty-prints objects with two-space indent', () => {
      expect(toJsonText({ a: 1 })).toBe('{\n  "a": 1\n}');
    });
  });
});
