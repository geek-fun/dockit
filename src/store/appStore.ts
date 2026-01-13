import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { chatBotApi, ProviderEnum, storeApi } from '../datasources';
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

export type AiConfig = {
  apiKey: string;
  model: string;
  prompt?: string;
  httpProxy?: string;
  enabled: boolean;
  provider: ProviderEnum;
};

export type EditorConfig = {
  fontSize: number;
  fontWeight: string;
  showLineNumbers: boolean;
  showMinimap: boolean;
};

export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    skipVersion: string;
    aiConfigs: Array<AiConfig>;
    editorConfig: EditorConfig;
  } => {
    return {
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
      uiThemeType: ThemeType.LIGHT,
      skipVersion: '',
      aiConfigs: [],
      editorConfig: {
        fontSize: 14,
        fontWeight: 'normal',
        showLineNumbers: true,
        showMinimap: false,
      },
    };
  },
  persist: true,
  actions: {
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

    getEditorOptions() {
      return {
        fontSize: this.editorConfig.fontSize,
        fontWeight: this.editorConfig.fontWeight,
        lineNumbers: this.editorConfig.showLineNumbers ? ('on' as const) : ('off' as const),
        minimap: { enabled: this.editorConfig.showMinimap },
      };
    },

    setEditorConfig(config: Partial<EditorConfig>) {
      this.editorConfig = { ...this.editorConfig, ...config };
    },

    async fetchAiConfigs() {
      this.aiConfigs = await storeApi.get<Array<AiConfig>>('aiConfigs', []);
    },

    async saveAiConfig(aiConfig?: AiConfig) {
      if (!aiConfig) {
        return;
      }

      if (aiConfig.enabled && !(await chatBotApi.validateConfig(aiConfig))) {
        throw new Error(lang.global.t('setting.ai.invalid'));
      }

      const config = this.aiConfigs.find(({ provider }) => provider === aiConfig.provider);
      if (config) {
        Object.assign(config, aiConfig);
      } else {
        this.aiConfigs.push(aiConfig);
      }

      await storeApi.setSecret('aiConfigs', pureObject(this.aiConfigs));
    },
  },
});
