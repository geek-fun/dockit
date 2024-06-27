import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { chatBotApi, storeApi } from '../datasources';
import { lang } from '../lang';
import { staticInfo, StaticInfo } from 'tauri-plugin-system-info-api';

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
export type OpenAiConfig = {
  apiKey: string;
  model: string;
  prompt?: string;
  httpProxy?: string;
  enabled: boolean;
};
export const useAppStore = defineStore('app', {
  state: (): {
    sysInfo: {};
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    skipVersion: string;
    aigcConfig: {
      openAi: OpenAiConfig;
    };
  } => {
    return {
      sysInfo: {},
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
      uiThemeType: ThemeType.LIGHT,
      skipVersion: '',
      aigcConfig: { openAi: {} as unknown as OpenAiConfig },
    };
  },
  persist: true,
  actions: {
    async fetchSysInfo() {
      const { name } = StaticInfo.parse(await staticInfo());
      this.sysInfo = {
        name,
      };
    },
    async fetchAigcConfig() {
      this.aigcConfig = await storeApi.getSecret<{ openAi: OpenAiConfig }>('aigcConfig', {
        openAi: {} as unknown as OpenAiConfig,
      });
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
    async saveAigcConfig({ openAi }: { openAi: OpenAiConfig }) {
      if (openAi.enabled && !(await chatBotApi.validateConfig(openAi))) {
        throw new Error(lang.global.t('setting.ai.invalid'));
      }

      this.aigcConfig = { openAi };

      await storeApi.setSecret('aigcConfig', pureObject({ openAi }));
    },
  },
});
