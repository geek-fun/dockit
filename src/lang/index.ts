import { createI18n, useI18n } from 'vue-i18n';
import { enUS } from './enUS';
import { zhCN } from './zhCN';
import { zhTW } from './zhTW';
import { ptBR } from './ptBR';
import { jaJP } from './jaJP';
import { koKR } from './koKR';
import { esES } from './esES';

type AppLocale = 'zhCN' | 'zhTW' | 'enUS' | 'ptBR' | 'jaJP' | 'koKR' | 'esES';

const isAppLocale = (value: unknown): value is AppLocale =>
  value === 'zhCN' ||
  value === 'zhTW' ||
  value === 'enUS' ||
  value === 'ptBR' ||
  value === 'jaJP' ||
  value === 'koKR' ||
  value === 'esES';

const getStoredLocale = (): AppLocale | 'auto' => {
  if (typeof localStorage === 'undefined') return 'enUS';
  const lang = localStorage.getItem('lang');
  if (isAppLocale(lang)) return lang;
  try {
    // Fall back to the persisted app-store choice so a language picked in settings
    // survives restarts (the picker only writes the pinia state).
    const app = JSON.parse(localStorage.getItem('app') ?? '{}') as { languageType?: unknown };
    if (isAppLocale(app.languageType)) return app.languageType;
  } catch {
    return 'auto';
  }
  return 'auto';
};

// maps a browser language tag onto an app locale; ambiguous or unknown tags fall back to enUS
const detectFromNavigator = (): AppLocale => {
  if (typeof navigator === 'undefined') return 'enUS';
  const tag = (navigator.language || '').toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(tag)) return 'zhTW';
  // bare zh and zh-sg resolve to zhCN per the unified language-detection standard (dockit#547)
  if (tag === 'zh' || tag === 'zh-cn' || tag === 'zh-sg') return 'zhCN';
  if (tag.startsWith('pt')) return 'ptBR';
  if (tag.startsWith('ja')) return 'jaJP';
  if (tag.startsWith('ko')) return 'koKR';
  if (tag.startsWith('es')) return 'esES';
  return 'enUS';
};

const resolveLocale = (): AppLocale => {
  const stored = getStoredLocale();
  return stored === 'auto' ? detectFromNavigator() : stored;
};

// BCP-47 tags reported with the device payload on login/activation (geekfun#548)
const BCP47_BY_LOCALE: Record<AppLocale, string> = {
  zhCN: 'zh-CN',
  zhTW: 'zh-TW',
  enUS: 'en-US',
  ptBR: 'pt-BR',
  jaJP: 'ja-JP',
  koKR: 'ko-KR',
  esES: 'es-ES',
};

const lang = createI18n({
  globalInjection: true,
  locale: resolveLocale(),
  fallbackLocale: 'enUS',
  legacy: false,
  messages: {
    zhCN,
    zhTW,
    enUS,
    ptBR,
    jaJP,
    koKR,
    esES,
  },
});

const useLang = useI18n;

export const getDocLanguage = (): 'en' | 'cn' => {
  const locale = resolveLocale();
  return locale === 'zhCN' || locale === 'zhTW' ? 'cn' : 'en';
};

// the currently effective UI locale as a BCP-47 tag (AUTO already resolved)
export const currentUiLocaleTag = (): string =>
  BCP47_BY_LOCALE[lang.global.locale.value as AppLocale] ?? 'en-US';

export { lang, useLang, detectFromNavigator };
