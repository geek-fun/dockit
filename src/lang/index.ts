import { createI18n, useI18n } from 'vue-i18n';
import { enUS } from './enUS';
import { zhCN } from './zhCN';
import { zhTW } from './zhTW';

type AppLocale = 'zhCN' | 'zhTW' | 'enUS';

const isAppLocale = (value: unknown): value is AppLocale =>
  value === 'zhCN' || value === 'zhTW' || value === 'enUS';

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

const resolveLocale = (): AppLocale => {
  const stored = getStoredLocale();
  if (stored === 'auto') {
    if (typeof navigator === 'undefined') return 'enUS';
    if (navigator.language === 'zh-CN') return 'zhCN';
    return /^zh-(TW|HK|MO|Hant)/i.test(navigator.language) ? 'zhTW' : 'enUS';
  }
  return stored;
};

const lang = createI18n({
  globalInjection: true,
  locale: resolveLocale(),
  legacy: false,
  messages: {
    zhCN,
    zhTW,
    enUS,
  },
});

const useLang = useI18n;

export const getDocLanguage = (): 'en' | 'cn' => {
  const locale = resolveLocale();
  return locale === 'zhCN' || locale === 'zhTW' ? 'cn' : 'en';
};

export { lang, useLang };
