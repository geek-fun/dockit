import { defineStore } from 'pinia';
import { pureObject } from '../common';

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
const { storeAPI } = window;
export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    skipVersion: string;
    aigcConfig: {
      openAi: { apiKey?: string; model?: string; prompt?: string };
    };
  } => {
    return {
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
      uiThemeType: ThemeType.LIGHT,
      skipVersion: '',
      aigcConfig: { openAi: {} },
    };
  },
  persist: true,
  actions: {
    async fetchAigcConfig() {
      this.aigcConfig = await storeAPI.getSecret('aigcConfig', { openAi: {} });
      console.log('aigcConfig', this.aigcConfig);
    },
    setConnectPanel() {
      this.connectPanel = !this.connectPanel;
    },
    setThemeType(themeType: ThemeType) {
      const uiThemType =
        themeType === ThemeType.AUTO
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? ThemeType.LIGHT
            : ThemeType.DARK
          : themeType;
      document.documentElement.setAttribute('theme', uiThemType);
      this.uiThemeType = uiThemType;
      this.themeType = themeType;
    },
    setUiThemeType(sysPrefer: Exclude<ThemeType, ThemeType.AUTO>) {
      const uiThemType = this.themeType === ThemeType.AUTO ? sysPrefer : this.themeType;
      document.documentElement.setAttribute('theme', uiThemType);
      this.uiThemeType = uiThemType;
    },
    getEditorTheme() {
      return this.uiThemeType === ThemeType.DARK ? 'vs-dark' : 'vs-light';
    },
    async saveAigcConfig(config: { [key: string]: unknown }) {
      this.aigcConfig = config;
      await storeAPI.setSecret('aigcConfig', pureObject(config));
    },
  },
});
