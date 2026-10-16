import { enUS } from '../../src/lang/enUS';
import { zhCN } from '../../src/lang/zhCN';

type Nested = { [key: string]: unknown };

const isPlainObject = (value: unknown): value is Nested =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const keyPaths = (source: Nested, prefix = ''): Array<string> =>
  Object.entries(source).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isPlainObject(value) ? keyPaths(value, path) : [path];
  });

const at = (source: Nested, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((node, step) => (isPlainObject(node) ? node[step] : undefined), source);

const placeholders = (value: unknown): Array<string> =>
  typeof value === 'string' ? [...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort() : [];

describe('lang key parity', () => {
  const enPaths = keyPaths(enUS as Nested);
  const zhPaths = new Set(keyPaths(zhCN as Nested));

  it('translates every enUS key in zhCN', () => {
    expect(enPaths.filter(path => !zhPaths.has(path))).toEqual([]);
  });

  it('does not keep stale keys that shadow another section', () => {
    // The Mongo truncation notice used to live under `manage.docs` as well, which is not
    // where its component reads it from (`editor.mongo`).
    expect(zhPaths.has('editor.mongo.resultsTruncated')).toBe(true);
    expect(zhPaths.has('manage.docs.resultsTruncated')).toBe(false);
  });

  it('keeps the dynamo editor keys identical in both languages', () => {
    const scope = 'editor.dynamo.';
    const enDynamo = enPaths.filter(path => path.startsWith(scope)).sort();
    const zhDynamo = [...zhPaths].filter(path => path.startsWith(scope)).sort();

    expect(zhDynamo).toEqual(enDynamo);
  });

  it('keeps the interpolation placeholders identical in both languages', () => {
    const mismatched = enPaths
      .filter(path => zhPaths.has(path))
      .map(path => ({
        path,
        en: placeholders(at(enUS as Nested, path)),
        zh: placeholders(at(zhCN as Nested, path)),
      }))
      .filter(({ en, zh }) => en.join(',') !== zh.join(','));

    expect(mismatched).toEqual([]);
  });

  it('covers the structured value dialog copy added by the dynamo write-path change', () => {
    const keys = [
      'editStructuredValue',
      'jsonInvalidSyntax',
      'jsonInvalidShape',
      'emptySetNotAllowed',
      'loadBinaryFile',
    ];

    keys.forEach(key => {
      const path = `editor.dynamo.${key}`;
      expect(zhPaths.has(path)).toBe(true);
      expect(typeof at(enUS as Nested, path)).toBe('string');
      expect(typeof at(zhCN as Nested, path)).toBe('string');
    });
  });
});
