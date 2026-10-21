import { createPinia, setActivePinia } from 'pinia';

const mockGetSecret = jest.fn();
const mockSetSecret = jest.fn();
const mockStoreGet = jest.fn();
const mockStoreSet = jest.fn();

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: {
    DEEP_SEEK: 'DEEP_SEEK',
    OPENROUTER: 'OPENROUTER',
    REQUESTY: 'REQUESTY',
    API_ROUTE: 'API_ROUTE',
    OLLAMA: 'OLLAMA',
  },
  storeApi: {
    getSecret: (...args: unknown[]) => mockGetSecret(...args),
    setSecret: (...args: unknown[]) => mockSetSecret(...args),
    get: (...args: unknown[]) => mockStoreGet(...args),
    set: (...args: unknown[]) => mockStoreSet(...args),
    delete: jest.fn().mockResolvedValue(undefined),
  },
  chatBotApi: { listModels: jest.fn(), validateConfig: jest.fn() },
  validateLlmConfig: jest.fn(),
}));

import { useAppStore } from '../src/store/appStore';

type StoredProvider = { kind: string; [key: string]: unknown };

const patchProvider = (
  providers: Array<StoredProvider>,
  kind: string,
  patch: Record<string, unknown>,
) => {
  const provider = providers.find(item => item.kind === kind);
  if (!provider) throw new Error(`missing provider ${kind}`);
  Object.assign(provider, patch);
};

describe('provider presets are opt-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActivePinia(createPinia());
    mockSetSecret.mockResolvedValue(undefined);
    mockStoreGet.mockResolvedValue(2);
    mockGetSecret.mockResolvedValue(undefined);
  });

  it('pre-adds only the starter providers on a fresh install', () => {
    const store = useAppStore();

    const enabledKinds = store.llmSettings.providers
      .filter(provider => provider.enabled)
      .map(provider => provider.kind);

    expect(enabledKinds).toEqual(['openai', 'deepseek', 'ollama']);
  });

  it('un-enables preset cards added by an earlier release when they were never configured', async () => {
    const store = useAppStore();
    const stored = JSON.parse(JSON.stringify(store.llmSettings));
    patchProvider(stored.providers, 'api-route', { enabled: true, apiKey: '', connected: false });
    patchProvider(stored.providers, 'cheaperinference', {
      enabled: true,
      apiKey: '',
      connected: false,
    });
    patchProvider(stored.providers, 'requesty', {
      enabled: true,
      apiKey: 'sk-requesty',
      connected: true,
    });
    patchProvider(stored.providers, 'openai', { enabled: true, apiKey: '', connected: false });
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(stored);

    await store.fetchLlmSettings();

    const enabled = (kind: string) =>
      store.providerConfigs.find(provider => provider.kind === kind)?.enabled;

    expect(enabled('api-route')).toBe(false);
    expect(enabled('cheaperinference')).toBe(false);
    expect(enabled('requesty')).toBe(true);
    expect(enabled('openai')).toBe(true);
    expect(mockStoreSet).toHaveBeenCalledWith('llmSettingsVersion', 2);
  });

  it('keeps a user-set autoCompact value when upgrading from V1', async () => {
    const store = useAppStore();
    const stored = JSON.parse(JSON.stringify(store.llmSettings));
    stored.chat.autoCompact = false;
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(stored);

    await store.fetchLlmSettings();

    expect(store.llmSettings.chat.autoCompact).toBe(false);
  });
});
