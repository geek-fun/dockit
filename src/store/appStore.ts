import { defineStore } from 'pinia';
import { pureObject, HISTORY_CAP_MIN, HISTORY_CAP_MAX, HISTORY_CAP_DEFAULT } from '../common';
import { chatBotApi, ProviderEnum, storeApi } from '../datasources';

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

export type ProviderKind =
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'ollama'
  | 'custom-openai'
  | 'custom-anthropic';

export type ModelCategory = 'general' | 'reasoning' | 'coding' | 'fast' | 'vision';

export type ModelRef = {
  id: string;
  label: string;
  providerKind: ProviderKind;
  providerConfigId: string;
  category?: ModelCategory;
};

export type ProviderConfig = {
  id: string;
  kind: ProviderKind;
  label: string;
  authMode: 'oauth' | 'api-key' | 'none';
  apiKey?: string;
  baseUrl?: string;
  proxy?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  discoveredModels: Array<ModelRef>;
  createdAt: number;
  updatedAt: number;
};

export type FeatureModelRoute = {
  selectedModelId?: string | null;
  preferredCategory?: 'general' | 'reasoning' | 'coding' | null;
  useRecommendedModel?: boolean;
};

export type LlmSettings = {
  providers: Array<ProviderConfig>;
  models: {
    sidebarAssistant: FeatureModelRoute;
    dataStudio: FeatureModelRoute;
  };
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

type LegacyAiConfig = {
  apiKey?: string;
  model?: string;
  httpProxy?: string;
  enabled?: boolean;
  provider?: ProviderEnum;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

const providerKindToEnum = (kind: ProviderKind): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    default:
      return ProviderEnum.OPENAI;
  }
};

const providerDefaults = (
  kind: ProviderKind,
): Pick<ProviderConfig, 'label' | 'authMode' | 'baseUrl'> => {
  switch (kind) {
    case 'openai':
      return { label: 'OpenAI', authMode: 'api-key', baseUrl: DEFAULT_OPENAI_BASE_URL };
    case 'deepseek':
      return { label: 'DeepSeek', authMode: 'api-key', baseUrl: DEFAULT_DEEPSEEK_BASE_URL };
    case 'openrouter':
      return { label: 'OpenRouter', authMode: 'oauth', baseUrl: DEFAULT_OPENROUTER_BASE_URL };
    case 'ollama':
      return { label: 'Ollama', authMode: 'none', baseUrl: DEFAULT_OLLAMA_BASE_URL };
    case 'custom-openai':
      return { label: 'OpenAI-Compatible', authMode: 'api-key', baseUrl: '' };
    case 'custom-anthropic':
      return { label: 'Anthropic-Compatible', authMode: 'api-key', baseUrl: '' };
  }
};

const defaultModelsByKind: Record<Exclude<ProviderKind, 'custom-anthropic'>, string[]> = {
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['openai/gpt-4.1-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro'],
  ollama: ['llama3.1', 'qwen2.5-coder', 'mistral'],
  'custom-openai': [],
};

const inferModelCategory = (modelId: string): ModelCategory => {
  const lowered = modelId.toLowerCase();
  if (lowered.includes('vision')) return 'vision';
  if (lowered.includes('coder') || lowered.includes('code')) return 'coding';
  if (lowered.includes('reason')) return 'reasoning';
  if (lowered.includes('mini') || lowered.includes('small') || lowered.includes('haiku'))
    return 'fast';
  return 'general';
};

const createModelRef = (
  providerConfigId: string,
  providerKind: ProviderKind,
  modelId: string,
): ModelRef => ({
  id: `${providerConfigId}::${modelId}`,
  label: modelId,
  providerKind,
  providerConfigId,
  category: inferModelCategory(modelId),
});

const buildDiscoveredModels = (
  providerConfigId: string,
  providerKind: ProviderKind,
  models?: Array<string>,
): Array<ModelRef> =>
  (models ?? defaultModelsByKind[providerKind as keyof typeof defaultModelsByKind] ?? []).map(
    modelId => createModelRef(providerConfigId, providerKind, modelId),
  );

const createProviderConfig = (
  kind: ProviderKind,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig => {
  const now = Date.now();
  const defaults = providerDefaults(kind);
  const id = overrides.id ?? `${kind}`;
  const discoveredModels =
    overrides.discoveredModels && overrides.discoveredModels.length > 0
      ? overrides.discoveredModels
      : buildDiscoveredModels(id, kind);

  return {
    id,
    kind,
    label: defaults.label,
    authMode: defaults.authMode,
    baseUrl: defaults.baseUrl,
    apiKey: '',
    proxy: '',
    headers: {},
    enabled: kind === 'openai' || kind === 'deepseek',
    connected: false,
    discoveredModels,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const defaultProviderConfigs = (): Array<ProviderConfig> => [
  createProviderConfig('openai'),
  createProviderConfig('deepseek'),
  createProviderConfig('openrouter'),
  createProviderConfig('ollama'),
  createProviderConfig('custom-openai', { enabled: false, label: 'Custom OpenAI-Compatible' }),
  createProviderConfig('custom-anthropic', {
    enabled: false,
    label: 'Custom Anthropic-Compatible',
    discoveredModels: [],
  }),
];

const defaultLlmSettings = (): LlmSettings => ({
  providers: defaultProviderConfigs(),
  models: {
    sidebarAssistant: {
      selectedModelId: null,
      preferredCategory: 'general',
      useRecommendedModel: true,
    },
    dataStudio: {
      selectedModelId: null,
      preferredCategory: 'reasoning',
      useRecommendedModel: true,
    },
  },
});

const normalizeProvider = (provider: ProviderEnum | undefined): ProviderKind => {
  switch (provider) {
    case ProviderEnum.DEEP_SEEK:
      return 'deepseek';
    case ProviderEnum.OPENROUTER:
      return 'openrouter';
    case ProviderEnum.OLLAMA:
      return 'ollama';
    default:
      return 'openai';
  }
};

const migrateLegacyAiConfigs = (legacyAiConfigs: Array<LegacyAiConfig>): LlmSettings => {
  const next = defaultLlmSettings();

  legacyAiConfigs.forEach(config => {
    const kind = normalizeProvider(config.provider);
    const existing = next.providers.find(provider => provider.kind === kind);
    if (!existing) return;

    const modelIds = config.model
      ? [config.model]
      : existing.discoveredModels.map(model => model.label);
    Object.assign(existing, {
      apiKey: config.apiKey ?? '',
      proxy: config.httpProxy ?? '',
      enabled: Boolean(config.enabled),
      connected: Boolean(config.apiKey || kind === 'ollama'),
      discoveredModels: buildDiscoveredModels(existing.id, existing.kind, modelIds),
      updatedAt: Date.now(),
    });
  });

  const enabledProviders = next.providers.filter(
    provider => provider.enabled && provider.discoveredModels.length > 0,
  );
  const preferredProvider =
    enabledProviders[0] ?? next.providers.find(provider => provider.kind === 'openai');
  const preferredModel = preferredProvider?.discoveredModels[0]?.id ?? null;

  next.models.sidebarAssistant.selectedModelId = preferredModel;
  next.models.sidebarAssistant.useRecommendedModel = !preferredModel;
  next.models.dataStudio.selectedModelId = preferredModel;
  next.models.dataStudio.useRecommendedModel = !preferredModel;

  return next;
};

const mergeProviderConfigs = (storedProviders: Array<ProviderConfig>): Array<ProviderConfig> => {
  const defaults = defaultProviderConfigs();
  const byKind = new Map(storedProviders.map(provider => [provider.kind, provider]));

  return defaults.map(defaultProvider => {
    const stored = byKind.get(defaultProvider.kind);
    if (!stored) return defaultProvider;

    const discoveredModels =
      stored.discoveredModels && stored.discoveredModels.length > 0
        ? stored.discoveredModels.map(model => ({
            ...model,
            providerKind: defaultProvider.kind,
            providerConfigId: stored.id ?? defaultProvider.id,
          }))
        : stored.enabled
          ? buildDiscoveredModels(stored.id ?? defaultProvider.id, defaultProvider.kind)
          : [];

    return {
      ...defaultProvider,
      ...stored,
      discoveredModels,
    };
  });
};

const normalizeFeatureRoute = (
  route: FeatureModelRoute | undefined,
  providers: Array<ProviderConfig>,
  fallbackCategory: 'general' | 'reasoning' | 'coding',
): FeatureModelRoute => {
  const selectedModelId = route?.selectedModelId ?? null;
  const selectedExists =
    selectedModelId === null
      ? false
      : providers.some(provider =>
          provider.discoveredModels.some(model => model.id === selectedModelId),
        );

  return {
    selectedModelId: selectedExists ? selectedModelId : null,
    preferredCategory: route?.preferredCategory ?? fallbackCategory,
    useRecommendedModel: route?.useRecommendedModel ?? !selectedExists,
  };
};

const mergeLlmSettings = (stored: Partial<LlmSettings> | undefined): LlmSettings => {
  const providers = mergeProviderConfigs(stored?.providers ?? []);

  return {
    providers,
    models: {
      sidebarAssistant: normalizeFeatureRoute(
        stored?.models?.sidebarAssistant,
        providers,
        'general',
      ),
      dataStudio: normalizeFeatureRoute(stored?.models?.dataStudio, providers, 'reasoning'),
    },
  };
};

const resolveRecommendedModelId = (
  providers: Array<ProviderConfig>,
  route: FeatureModelRoute,
): string | null => {
  const enabledProviders = providers.filter(provider => provider.enabled && provider.connected);
  const category = route.preferredCategory ?? 'general';
  const matchesCategory = enabledProviders
    .flatMap(provider => provider.discoveredModels)
    .find(model => model.category === category);

  return (
    matchesCategory?.id ??
    enabledProviders.flatMap(provider => provider.discoveredModels)[0]?.id ??
    null
  );
};

const reconcileModelRoutes = (settings: LlmSettings): LlmSettings['models'] => ({
  sidebarAssistant: normalizeFeatureRoute(
    settings.models.sidebarAssistant,
    settings.providers,
    'general',
  ),
  dataStudio: normalizeFeatureRoute(settings.models.dataStudio, settings.providers, 'reasoning'),
});

export const useAppStore = defineStore('app', {
  state: (): {
    themeType: ThemeType;
    languageType: LanguageType;
    connectPanel: boolean;
    uiThemeType: Exclude<ThemeType, ThemeType.AUTO>;
    llmSettings: LlmSettings;
    editorConfig: EditorConfig;
    historyConfig: HistoryConfig;
  } => ({
    themeType: ThemeType.AUTO,
    languageType: LanguageType.AUTO,
    connectPanel: true,
    uiThemeType: ThemeType.LIGHT,
    llmSettings: defaultLlmSettings(),
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
  }),
  persist: {
    pick: [
      'themeType',
      'languageType',
      'connectPanel',
      'uiThemeType',
      'editorConfig',
      'historyConfig',
    ],
  },
  getters: {
    providerConfigs(state): Array<ProviderConfig> {
      return state.llmSettings.providers;
    },
    enabledProviders(state): Array<ProviderConfig> {
      return state.llmSettings.providers.filter(provider => provider.enabled);
    },
    availableModels(state): Array<ModelRef> {
      return state.llmSettings.providers.flatMap(provider => provider.discoveredModels);
    },
  },
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
    async fetchLlmSettings() {
      const storedSettings = await storeApi.getSecret<LlmSettings | undefined>(
        'llmSettings',
        undefined,
      );
      if (storedSettings) {
        this.llmSettings = mergeLlmSettings(storedSettings);
        return this.llmSettings;
      }

      const legacyAiConfigs = await storeApi.getSecret<Array<LegacyAiConfig>>('aiConfigs', []);
      this.llmSettings =
        legacyAiConfigs.length > 0 ? migrateLegacyAiConfigs(legacyAiConfigs) : defaultLlmSettings();
      await storeApi.setSecret('llmSettings', pureObject(this.llmSettings));
      return this.llmSettings;
    },
    async persistLlmSettings() {
      this.llmSettings.models = reconcileModelRoutes(this.llmSettings);
      await storeApi.setSecret('llmSettings', pureObject(this.llmSettings));
    },
    async updateProviderConfig(providerId: string, patch: Partial<ProviderConfig>) {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider) return;

      Object.assign(provider, patch, { updatedAt: Date.now() });

      if (patch.discoveredModels && patch.discoveredModels.length > 0) {
        provider.discoveredModels = patch.discoveredModels.map(model => ({
          ...model,
          providerKind: provider.kind,
          providerConfigId: provider.id,
        }));
      } else if (provider.enabled && provider.discoveredModels.length === 0) {
        provider.discoveredModels = buildDiscoveredModels(provider.id, provider.kind);
      }

      await this.persistLlmSettings();
    },
    async syncProviderModels(providerId: string, modelLabels?: Array<string>) {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider) return [];

      if (provider.kind === 'custom-anthropic') {
        return provider.discoveredModels;
      }

      const discoveredModelLabels =
        modelLabels && modelLabels.length > 0
          ? modelLabels
          : await chatBotApi.listModels({
              provider: providerKindToEnum(provider.kind),
              apiKey: provider.apiKey ?? '',
              httpProxy: provider.proxy || undefined,
              baseUrl: provider.baseUrl,
            });

      const discoveredModels = buildDiscoveredModels(
        provider.id,
        provider.kind,
        discoveredModelLabels,
      );

      provider.discoveredModels = discoveredModels;
      provider.connected = discoveredModels.length > 0 || provider.kind === 'ollama';
      provider.updatedAt = Date.now();
      await this.persistLlmSettings();
      return discoveredModels;
    },
    async testProvider(providerId: string): Promise<boolean> {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider || !provider.enabled) return false;
      if (provider.kind === 'custom-anthropic') return false;

      const modelLabel = provider.discoveredModels[0]?.label ?? '';

      const isValid = await chatBotApi.validateConfig({
        provider: providerKindToEnum(provider.kind),
        apiKey: provider.apiKey ?? '',
        model: modelLabel,
        httpProxy: provider.proxy || undefined,
        baseUrl: provider.baseUrl,
      });

      provider.connected = isValid;
      provider.updatedAt = Date.now();
      await this.persistLlmSettings();
      return isValid;
    },
    async setFeatureModelRoute(
      feature: 'sidebarAssistant' | 'dataStudio',
      route: Partial<FeatureModelRoute>,
    ) {
      this.llmSettings.models[feature] = {
        ...this.llmSettings.models[feature],
        ...route,
      };
      await this.persistLlmSettings();
    },
    getResolvedFeatureModel(feature: 'sidebarAssistant' | 'dataStudio') {
      const route = this.llmSettings.models[feature];
      const selectedModel = route.selectedModelId
        ? this.availableModels.find(model => model.id === route.selectedModelId)
        : undefined;

      const modelId =
        route.useRecommendedModel || !selectedModel
          ? resolveRecommendedModelId(this.llmSettings.providers, route)
          : selectedModel.id;

      if (!modelId) {
        return undefined;
      }

      const resolvedModel = this.availableModels.find(model => model.id === modelId);
      if (!resolvedModel) {
        return undefined;
      }

      const provider = this.llmSettings.providers.find(
        item => item.id === resolvedModel.providerConfigId && item.enabled,
      );

      if (!provider) {
        return undefined;
      }

      return { provider, model: resolvedModel };
    },
  },
});
