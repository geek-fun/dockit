import { createI18n } from 'vue-i18n';
import zhCN from './zhCN';
import enUS from './enUS';

const langType = localStorage.lang || 'auto';
let langName = langType;
if (langType === 'auto') {
  langName = navigator.language === 'zh-CN' ? 'zhCN' : 'enUS';
}

const i18n = createI18n({
  globalInjection: true,
  locale: langName,
  messages: {
    zhCN,
    enUS,
  },
});
export default i18n;
