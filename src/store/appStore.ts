import { defineStore } from 'pinia';
import { pureObject, HISTORY_CAP_MIN, HISTORY_CAP_MAX, HISTORY_CAP_DEFAULT } from '../common';
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
  tabSize: number;
  insertSpaces: boolean;
};

export type HistoryConfig = {
  historyCap: number;
};

export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    aiConfigs: Array<AiConfig>;
    editorConfig: EditorConfig;
    historyConfig: HistoryConfig;
  } => {
    return {
      themeType: ThemeType.AUTO,
      languageType: LanguageType.AUTO,
      connectPanel: true, //
      uiThemeType: ThemeType.LIGHT,
      aiConfigs: [],
      editorConfig: {
        fontSize: 14,
        fontWeight: 'normal',
        showLineNumbers: true,
        showMinimap: false,
        tabSize: 2,
        insertSpaces: true,
      },
      historyConfig: {
        historyCap: HISTORY_CAP_DEFAULT,
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
        tabSize: this.editorConfig.tabSize,
        insertSpaces: this.editorConfig.insertSpaces,
        detectIndentation: false,
      };
    },

    setEditorConfig(config: Partial<EditorConfig>) {
      this.editorConfig = { ...this.editorConfig, ...config };
    },

    setHistoryConfig(config: Partial<HistoryConfig>) {
      const cap = config.historyCap ?? this.historyConfig.historyCap;
      this.historyConfig = {
        ...this.historyConfig,
        historyCap: Math.min(HISTORY_CAP_MAX, Math.max(HISTORY_CAP_MIN, cap)),
      };
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
