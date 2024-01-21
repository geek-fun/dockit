import { defineStore } from 'pinia';
export const useAppStore = defineStore('app', {
  state() {
    return {
      themeType: 0, // 0 auto, 1: dark, 2: light
      languageType: 'auto', // 0: auto, 1: zhCN, 2: enUS
      languageName: 'zhCN', // zhCN || enUS
      connectPannel: true, //
    };
  },
  actions: {
    setThemeType(args: number) {
      this.themeType = args;
      localStorage.setItem('theme-type', String(args));
    },
    setLanguageType(args: string) {
      this.languageType = args;
      localStorage.setItem('lang', String(args));
      if (args === 'auto') {
        this.languageName = navigator.language === 'zh-CN' ? 'zhCN' : 'enUS';
      } else {
        this.languageName = args;
      }
    },
    setConnectPannel() {
      this.connectPannel = !this.connectPannel;
    },
  },
  persist: {
    // 设置为 true 表示在页面刷新时，Pinia 状态仍然会被保存。
    paths: ['themeType', 'languageType', 'languageName', 'connectPannel'],
    storage: localStorage,
  },
});
