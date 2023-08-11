import { defineStore } from 'pinia';
export const useAppStore = defineStore('app', {
  state() {
    return {
      themeType: 0, // 0 auto, 1: dark, 2: light
      languageType: 'auto', // 0: auto, 1: zhCN, 2: enUS
      languageName: 'zhCN', // zhCN || enUS
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
  },
});
