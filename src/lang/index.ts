import { createI18n } from 'vue-i18n';
const enUS = {
  setting: {
    basic: 'Basic',
    theme: 'Theme',
    language: 'Language',
    about: 'About Us',
  },
  connection: {
    new: 'New connection',
    test: 'Test connection',
    name: 'Name',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    password: 'Password',
    queryParameters: 'query parameters',
  },
  form: {
    confirm: 'Confirm',
    cancel: 'Cancel',
  },
};

const zhCN = {
  setting: {
    basic: '通用设置',
    theme: '主题外观',
    language: '系统语言',
    about: '关于软件',
  },
  connection: {
    new: '新建连接',
    test: '测试连接',
    name: '连接名称',
    host: '主机地址',
    port: '端口号',
    username: '用户名',
    password: '密码',
    queryParameters: '查询参数',
  },
  form: {
    confirm: '确认',
    cancel: '取消',
  },
};

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
