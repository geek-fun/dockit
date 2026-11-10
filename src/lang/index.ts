import { createI18n, useI18n } from 'vue-i18n';
import { enUS } from './enUS';
import { zhCN } from './zhCN';
import { zhTW } from './zhTW';

type AppLocale = 'zhCN' | 'zhTW' | 'enUS';

const getStoredLocale = (): AppLocale | 'auto' => {
  if (typeof localStorage === 'undefined') return 'enUS';
  return (localStorage.getItem('lang') as AppLocale | 'auto') || 'auto';
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
