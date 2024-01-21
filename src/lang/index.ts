import { createI18n } from 'vue-i18n';
import { enUS } from './enUS';
import { zhCN } from './zhCN';

const langType = localStorage.lang || 'auto';
let langName = langType;
if (langType === 'auto') {
  langName = navigator.language === 'zh-CN' ? 'zhCN' : 'enUS';
}

const lang = createI18n({
  globalInjection: true,
  locale: langName,
  legacy: false,
  messages: {
    zhCN,
    enUS,
  },
});
import { useI18n } from 'vue-i18n';
const useLang = useI18n;

export { lang, useLang };
