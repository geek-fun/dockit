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

// maps a browser language tag onto an app locale; unknown tags fall back to enUS
const detectFromNavigator = (): AppLocale => {
  if (typeof navigator === 'undefined') return 'enUS';
  const tag = (navigator.language || '').toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(tag)) return 'zhTW';
  if (tag.startsWith('zh')) return 'zhCN';
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

export { lang, useLang, detectFromNavigator };
