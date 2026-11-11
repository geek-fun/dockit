import { enUS } from '../../src/lang/enUS';
import { zhCN } from '../../src/lang/zhCN';
import { zhTW } from '../../src/lang/zhTW';

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

const locales = [
  { name: 'zhCN', messages: zhCN },
  { name: 'zhTW', messages: zhTW },
] as const;

describe('lang key parity', () => {
  const enPaths = keyPaths(enUS as Nested);
  const enSet = new Set(enPaths);

  locales.forEach(({ name, messages }) => {
    const localePaths = keyPaths(messages as Nested);
    const localeSet = new Set(localePaths);

    it(`translates every enUS key in ${name} and adds no extra keys`, () => {
      expect(enPaths.filter(path => !localeSet.has(path))).toEqual([]);
      expect(localePaths.filter(path => !enSet.has(path))).toEqual([]);
    });

    it(`keeps the interpolation placeholders identical to enUS (${name})`, () => {
      const mismatched = enPaths
        .map(path => ({
          path,
          en: placeholders(at(enUS as Nested, path)),
          locale: placeholders(at(messages as Nested, path)),
        }))
        .filter(({ en, locale }) => en.join(',') !== locale.join(','));

      expect(mismatched).toEqual([]);
    });
  });

  it('does not keep stale keys that shadow another section', () => {
    // The Mongo truncation notice used to live under `manage.docs` as well, which is not
    // where its component reads it from (`editor.mongo`).
    const zhPaths = new Set(keyPaths(zhCN as Nested));
    expect(zhPaths.has('editor.mongo.resultsTruncated')).toBe(true);
    expect(zhPaths.has('manage.docs.resultsTruncated')).toBe(false);
  });

  it('keeps the dynamo editor keys identical in both languages', () => {
    const scope = 'editor.dynamo.';
    const zhDynamo = keyPaths(zhCN as Nested)
      .filter(path => path.startsWith(scope))
      .sort();

    expect(zhDynamo).toEqual(enPaths.filter(path => path.startsWith(scope)).sort());
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
      expect(typeof at(enUS as Nested, path)).toBe('string');
      expect(typeof at(zhCN as Nested, path)).toBe('string');
    });
  });
});
