import { defineStore } from 'pinia';
export enum ThemeType {
  AUTO = 'auto',
  DARK = 'dark',
  LIGHT = 'light',
}
export enum LanguageType {
  AUTO = 'auto',
  ZH_CN = 'zhCN',
  EN_US = 'enUS',
}
export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
  } => {
    return {
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
    };
  },
  persist: true,
  actions: {
    setConnectPanel() {
      this.connectPanel = !this.connectPanel;
    },
    getEditorTheme() {
      return this.themeType === ThemeType.DARK ? 'vs-dark' : 'vs-light';
    },
  },
});
