import { enUS } from '../../src/lang/enUS';
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

describe('zhTW key parity', () => {
  const enPaths = keyPaths(enUS as Nested);
  const twPaths = keyPaths(zhTW as Nested);

  it('translates every enUS key in zhTW and adds no extra keys', () => {
    const tw = new Set(twPaths);
    const en = new Set(enPaths);
    // `setting.zhTW` is the language-picker label; enUS carries it too, so the sets must match.
    expect(enPaths.filter(path => !tw.has(path))).toEqual([]);
    expect(twPaths.filter(path => !en.has(path))).toEqual([]);
  });

  it('keeps the interpolation placeholders identical to enUS', () => {
    const mismatched = enPaths
      .map(path => ({
        path,
        en: placeholders(at(enUS as Nested, path)),
        tw: placeholders(at(zhTW as Nested, path)),
      }))
      .filter(({ en, tw }) => en.join(',') !== tw.join(','));

    expect(mismatched).toEqual([]);
  });
});
