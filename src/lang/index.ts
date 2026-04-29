import { createI18n, useI18n } from 'vue-i18n';
import { enUS } from './enUS';
import { zhCN } from './zhCN';

type AppLocale = 'zhCN' | 'enUS';

const getStoredLocale = (): AppLocale | 'auto' => {
  if (typeof localStorage === 'undefined') return 'enUS';
  return (localStorage.getItem('lang') as AppLocale | 'auto') || 'auto';
};

const resolveLocale = (): AppLocale => {
  const stored = getStoredLocale();
  if (stored === 'auto') {
    return typeof navigator !== 'undefined' && navigator.language === 'zh-CN' ? 'zhCN' : 'enUS';
  }
  return stored;
};

const lang = createI18n({
  globalInjection: true,
  locale: resolveLocale(),
  legacy: false,
  messages: {
    zhCN,
    enUS,
  },
});

const useLang = useI18n;

export const getDocLanguage = (): 'en' | 'cn' => {
  const locale = resolveLocale();
  return locale === 'zhCN' ? 'cn' : 'en';
};

export { lang, useLang };
