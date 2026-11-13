import { enUS } from '@/lang/enUS';
import { zhCN } from '@/lang/zhCN';
import { zhTW } from '@/lang/zhTW';
import { ptBR } from '@/lang/ptBR';
import { jaJP } from '@/lang/jaJP';
import { koKR } from '@/lang/koKR';
import { esES } from '@/lang/esES';

type Messages = Record<string, unknown>;

const flatten = (messages: Messages, prefix = ''): string[] =>
  Object.entries(messages).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Messages, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

// Guards against locale drift: every language file must carry exactly the same
// key set as enUS, otherwise missing keys silently fall back to English at runtime.
describe('i18n locale parity', () => {
  const locales: Record<string, Messages> = { zhCN, zhTW, ptBR, jaJP, koKR, esES };

  it.each(Object.entries(locales))('%s has exactly the enUS key set', (_name, messages) => {
    const baseKeys = flatten(enUS as unknown as Messages).sort();
    const localeKeys = flatten(messages).sort();
    const missing = baseKeys.filter(key => !localeKeys.includes(key));
    const extra = localeKeys.filter(key => !baseKeys.includes(key));

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });
});
