import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { chatBotApi, storeApi } from '../datasources';
import { lang } from '../lang';

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
export enum ProviderEnum {
  OPENAI = 'OPENAI',
  DEEP_SEEK = 'DEEP_SEEK',
}
export type AiConfig = {
  apiKey: string;
  model: string;
  prompt?: string;
  httpProxy?: string;
  enabled: boolean;
  provider: ProviderEnum;
};
export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    skipVersion: string;
    aigcConfigs: Array<AiConfig>;
  } => {
    return {
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
      uiThemeType: ThemeType.LIGHT,
      skipVersion: '',
      aigcConfigs: [],
    };
  },
  persist: true,
  actions: {
    async fetchAigcConfigs() {
      this.aigcConfigs = await storeApi.get<Array<AiConfig>>('aigcConfigs', []);
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

    async saveAigcConfig(aiConfig?: AiConfig) {
      if (!aiConfig) {
        return;
      }
      if (aiConfig.enabled && !(await chatBotApi.validateConfig(aiConfig))) {
        throw new Error(lang.global.t('setting.ai.invalid'));
      }

      const config = this.aigcConfigs.find(({ provider }) => provider === aiConfig.provider);
      if (config) {
        Object.assign(config, aiConfig);
      } else {
        this.aigcConfigs.push(aiConfig);
      }

      await storeApi.setSecret('aigcConfigs', pureObject(this.aigcConfigs));
    },
  },
});
