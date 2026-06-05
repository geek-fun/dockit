import { defineStore } from 'pinia';
import {
  pureObject,
  HISTORY_CAP_MIN,
  HISTORY_CAP_MAX,
  HISTORY_CAP_DEFAULT,
  CHAT_RUNTIME_DEFAULTS,
  LLM_SETTINGS_SCHEMA_VERSION,
} from '../common';
import { chatBotApi, ProviderEnum, storeApi, validateLlmConfig } from '../datasources';

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
  | 'lm-studio'
  | 'custom-openai'
  | 'custom-anthropic'
  | 'anthropic'
  | 'gemini'
  | 'grok'
  | 'mistral'
  | 'azure-openai';

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
  apiCompatibility: 'openai-compatible' | 'anthropic' | 'local';
  label: string;
  authMode: 'oauth' | 'api-key' | 'none';
  apiKey?: string;
  baseUrl?: string;
  proxyMode: 'system' | 'manual' | 'none';
  proxy?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  discoveredModels: Array<ModelRef>;
  contextWindowOverride?: number;
  createdAt: number;
  updatedAt: number;
};

export type FeatureModelRoute = {
  selectedModelId?: string | null;
  preferredCategory?: 'general' | 'reasoning' | 'coding' | null;
  useRecommendedModel?: boolean;
};

export type ChatRuntimeConfig = {
  autoCompact: boolean;
  maxIterations: number;
  wallClockBudgetMin: number;
  tokenBudget: number;
};

export type LlmSettings = {
  providers: Array<ProviderConfig>;
  models: {
    sidebarAssistant: FeatureModelRoute;
    dataStudio: FeatureModelRoute;
  };
  chat: ChatRuntimeConfig;
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

type ProviderPreset = {
  kind: ProviderKind;
  apiCompatibility: ProviderConfig['apiCompatibility'];
  label: string;
  authMode: ProviderConfig['authMode'];
  defaultBaseUrl: string;
  enabled: boolean;
  defaultModels: string[];
};

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: 'openai',
    apiCompatibility: 'openai-compatible',
    label: 'OpenAI',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.openai.com/v1',
    enabled: true,
    defaultModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
  },
  {
    kind: 'deepseek',
    apiCompatibility: 'openai-compatible',
    label: 'DeepSeek',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    enabled: true,
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    kind: 'openrouter',
    apiCompatibility: 'openai-compatible',
    label: 'OpenRouter',
    authMode: 'api-key',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    enabled: true,
    defaultModels: ['openai/gpt-4.1-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro'],
  },
  {
    kind: 'anthropic',
    apiCompatibility: 'anthropic',
    label: 'Anthropic',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    enabled: false,
    defaultModels: ['claude-sonnet-4-5', 'claude-opus-4'],
  },
  {
    kind: 'gemini',
    apiCompatibility: 'openai-compatible',
    label: 'Google Gemini',
    authMode: 'api-key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    enabled: true,
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  {
    kind: 'grok',
    apiCompatibility: 'openai-compatible',
    label: 'Grok',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.x.ai/v1',
    enabled: false,
    defaultModels: ['grok-3'],
  },
  {
    kind: 'mistral',
    apiCompatibility: 'openai-compatible',
    label: 'Mistral',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    enabled: false,
    defaultModels: ['mistral-large', 'mistral-small', 'codestral'],
  },
  {
    kind: 'azure-openai',
    apiCompatibility: 'openai-compatible',
    label: 'Azure OpenAI',
    authMode: 'api-key',
    defaultBaseUrl: '',
    enabled: false,
    defaultModels: [],
  },
  {
    kind: 'ollama',
    apiCompatibility: 'local',
    label: 'Ollama',
    authMode: 'none',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    enabled: true,
    defaultModels: ['llama3.1', 'qwen2.5-coder', 'mistral'],
  },
  {
    kind: 'lm-studio',
    apiCompatibility: 'openai-compatible',
    label: 'LM Studio',
    authMode: 'none',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    enabled: false,
    defaultModels: [],
  },
  {
    kind: 'custom-openai',
    apiCompatibility: 'openai-compatible',
    label: 'Custom OpenAI-Compatible',
    authMode: 'api-key',
    defaultBaseUrl: '',
    enabled: false,
    defaultModels: [],
  },
  {
    kind: 'custom-anthropic',
    apiCompatibility: 'anthropic',
    label: 'Custom Anthropic-Compatible',
    authMode: 'api-key',
    defaultBaseUrl: '',
    enabled: false,
    defaultModels: [],
  },
];

const defaultModelsByKind: Record<ProviderKind, string[]> = {
  openai: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  openrouter: ['openai/gpt-4.1-mini', 'anthropic/claude-3.7-sonnet', 'google/gemini-2.5-pro'],
  ollama: ['llama3.1', 'qwen2.5-coder', 'mistral'],
  'lm-studio': [],
  'custom-openai': [],
  'custom-anthropic': [],
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  grok: ['grok-3'],
  mistral: ['mistral-large', 'mistral-small', 'codestral'],
  'azure-openai': [],
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
  const preset = PROVIDER_PRESETS.find(p => p.kind === kind) ?? PROVIDER_PRESETS[0];
  const id = overrides.id ?? `${kind}`;
  const discoveredModels =
    overrides.discoveredModels && overrides.discoveredModels.length > 0
      ? overrides.discoveredModels
      : buildDiscoveredModels(id, kind);

  return {
    id,
    kind,
    apiCompatibility: preset.apiCompatibility,
    label: preset.label,
    authMode: preset.authMode,
    baseUrl: preset.defaultBaseUrl,
    apiKey: '',
    proxyMode: 'none',
    proxy: '',
    headers: {},
    enabled: preset.enabled,
    connected: false,
    discoveredModels,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

const defaultProviderConfigs = (): Array<ProviderConfig> =>
  PROVIDER_PRESETS.map(preset => createProviderConfig(preset.kind));

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
  chat: { ...CHAT_RUNTIME_DEFAULTS },
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
      proxyMode: config.httpProxy ? 'manual' : 'none',
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
      label: defaultProvider.label,
      // Migrate: if user had a proxy URL but no proxyMode, default to manual
      proxyMode: stored.proxyMode ?? (stored.proxy ? 'manual' : 'none'),
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
    chat: {
      autoCompact: stored?.chat?.autoCompact ?? CHAT_RUNTIME_DEFAULTS.autoCompact,
      maxIterations: stored?.chat?.maxIterations ?? CHAT_RUNTIME_DEFAULTS.maxIterations,
      wallClockBudgetMin:
        stored?.chat?.wallClockBudgetMin ?? CHAT_RUNTIME_DEFAULTS.wallClockBudgetMin,
      tokenBudget: stored?.chat?.tokenBudget ?? CHAT_RUNTIME_DEFAULTS.tokenBudget,
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
    chatConfig(state): ChatRuntimeConfig {
      return {
        autoCompact: state.llmSettings.chat?.autoCompact ?? CHAT_RUNTIME_DEFAULTS.autoCompact,
        maxIterations: state.llmSettings.chat?.maxIterations ?? CHAT_RUNTIME_DEFAULTS.maxIterations,
        wallClockBudgetMin:
          state.llmSettings.chat?.wallClockBudgetMin ?? CHAT_RUNTIME_DEFAULTS.wallClockBudgetMin,
        tokenBudget: state.llmSettings.chat?.tokenBudget ?? CHAT_RUNTIME_DEFAULTS.tokenBudget,
      };
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
        // Load chat settings from dedicated key (more reliable)
        const storedChat = await storeApi.getSecret<ChatRuntimeConfig | undefined>(
          'chatSettings',
          undefined,
        );
        const storedVersion = await storeApi.get<number | undefined>(
          'llmSettingsVersion',
          undefined,
        );

        // V1 migration: reset autoCompact to true for any persisted data from the
        // old buggy version where it was undefined/false due to the storedChat overwrite bug
        if (!storedVersion || storedVersion < LLM_SETTINGS_SCHEMA_VERSION) {
          this.llmSettings.chat = {
            autoCompact: CHAT_RUNTIME_DEFAULTS.autoCompact,
            maxIterations: storedChat?.maxIterations ?? CHAT_RUNTIME_DEFAULTS.maxIterations,
            wallClockBudgetMin:
              storedChat?.wallClockBudgetMin ?? CHAT_RUNTIME_DEFAULTS.wallClockBudgetMin,
            tokenBudget: storedChat?.tokenBudget ?? CHAT_RUNTIME_DEFAULTS.tokenBudget,
          };
          await Promise.all([
            storeApi.set('llmSettingsVersion', LLM_SETTINGS_SCHEMA_VERSION),
            storeApi.setSecret('chatSettings', pureObject(this.llmSettings.chat)),
            storeApi.setSecret('llmSettings', pureObject(this.llmSettings)),
          ]);
        } else if (storedChat) {
          this.llmSettings.chat = {
            autoCompact: storedChat.autoCompact ?? CHAT_RUNTIME_DEFAULTS.autoCompact,
            maxIterations: storedChat.maxIterations ?? CHAT_RUNTIME_DEFAULTS.maxIterations,
            wallClockBudgetMin:
              storedChat.wallClockBudgetMin ?? CHAT_RUNTIME_DEFAULTS.wallClockBudgetMin,
            tokenBudget: storedChat.tokenBudget ?? CHAT_RUNTIME_DEFAULTS.tokenBudget,
          };
        }
        return this.llmSettings;
      }

      const legacyAiConfigs = await storeApi.getSecret<Array<LegacyAiConfig>>('aiConfigs', []);
      this.llmSettings =
        legacyAiConfigs.length > 0 ? migrateLegacyAiConfigs(legacyAiConfigs) : defaultLlmSettings();
      await storeApi.setSecret('llmSettings', pureObject(this.llmSettings));
      await storeApi.set('llmSettingsVersion', LLM_SETTINGS_SCHEMA_VERSION);
      return this.llmSettings;
    },
    async persistLlmSettings() {
      this.llmSettings.models = reconcileModelRoutes(this.llmSettings);
      await storeApi.setSecret('llmSettings', pureObject(this.llmSettings));
    },
    async saveChatSettings(
      chat: Partial<ChatRuntimeConfig>,
    ): Promise<{ success: boolean; error?: string }> {
      if (!this.llmSettings.chat) {
        this.llmSettings.chat = { ...chat } as ChatRuntimeConfig;
      }
      // Save previous state for rollback
      const previous = { ...this.llmSettings.chat };
      Object.assign(this.llmSettings.chat, chat);
      try {
        await Promise.all([
          storeApi.setSecret('chatSettings', pureObject(this.llmSettings.chat)),
          storeApi.setSecret('llmSettings', pureObject(this.llmSettings)),
        ]);
        return { success: true };
      } catch (err) {
        this.llmSettings.chat = previous;
        return { success: false, error: (err as Error).message || String(err) };
      }
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
    async resetProviderConfig(providerId: string) {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider) return;

      const defaults = createProviderConfig(provider.kind, { enabled: false });
      Object.assign(provider, {
        ...defaults,
        id: providerId,
        createdAt: provider.createdAt,
        updatedAt: Date.now(),
      });

      await this.persistLlmSettings();
    },
    async syncProviderModels(providerId: string, modelLabels?: Array<string>) {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider) return [];

      let discoveredModelLabels: Array<string>;
      if (modelLabels && modelLabels.length > 0) {
        discoveredModelLabels = modelLabels;
      } else {
        try {
          discoveredModelLabels = await chatBotApi.listModels({
            provider: provider.apiCompatibility,
            apiKey: provider.apiKey ?? '',
            httpProxy: provider.proxy || undefined,
            proxyMode: provider.proxyMode,
            baseUrl: provider.baseUrl,
          });
        } catch (err) {
          provider.connected = false;
          provider.updatedAt = Date.now();
          await this.persistLlmSettings();
          throw err;
        }
      }

      const discoveredModels = buildDiscoveredModels(
        provider.id,
        provider.kind,
        discoveredModelLabels,
      );

      provider.discoveredModels = discoveredModels;
      provider.connected =
        discoveredModels.length > 0 || provider.kind === 'ollama' || provider.kind === 'lm-studio';
      provider.updatedAt = Date.now();
      await this.persistLlmSettings();
      return discoveredModels;
    },
    async testProvider(providerId: string): Promise<{ valid: boolean; error?: string }> {
      const provider = this.llmSettings.providers.find(item => item.id === providerId);
      if (!provider || !provider.enabled) return { valid: false };

      const modelLabel = provider.discoveredModels[0]?.label ?? '';

      const result = await chatBotApi.validateConfig({
        provider: provider.apiCompatibility,
        apiKey: provider.apiKey ?? '',
        model: modelLabel,
        httpProxy: provider.proxy || undefined,
        proxyMode: provider.proxyMode,
        baseUrl: provider.baseUrl,
      });

      provider.connected = result.valid;
      provider.updatedAt = Date.now();
      await this.persistLlmSettings();
      return result;
    },
    async verifyModelAvailability(modelId: string): Promise<boolean> {
      const model = this.availableModels.find(m => m.id === modelId);
      if (!model) return false;
      const provider = this.llmSettings.providers.find(p => p.id === model.providerConfigId);
      if (!provider || !provider.enabled) return false;

      return validateLlmConfig({
        provider: provider.apiCompatibility,
        apiKey: provider.apiKey ?? '',
        model: model.label,
        httpProxy: provider.proxy || undefined,
        proxyMode: provider.proxyMode,
        baseUrl: provider.baseUrl,
      }).catch(() => false);
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
