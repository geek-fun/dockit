import { createPinia, setActivePinia } from 'pinia';

const mockGetSecret = jest.fn();
const mockSetSecret = jest.fn();
const mockListModels = jest.fn();
const mockValidateConfig = jest.fn();

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
    get: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  },
  chatBotApi: {
    listModels: (...args: unknown[]) => mockListModels(...args),
    validateConfig: (...args: unknown[]) => mockValidateConfig(...args),
  },
  validateLlmConfig: jest.fn(),
}));

import { useAppStore } from '../src/store/appStore';
import { ProviderEnum } from '../src/datasources';

describe('API Route provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActivePinia(createPinia());
    mockSetSecret.mockResolvedValue(undefined);
    mockGetSecret.mockResolvedValue(undefined);
  });

  it('migrates legacy API Route settings and persists the model and credentials', async () => {
    const store = useAppStore();
    mockGetSecret.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      {
        provider: ProviderEnum.API_ROUTE,
        enabled: true,
        apiKey: 'legacy-api-route-key',
        model: 'legacy-account-model',
        httpProxy: 'http://localhost:8080',
      },
    ]);

    await store.fetchLlmSettings();

    const provider = store.providerConfigs.find(provider => provider.kind === 'api-route');
    expect(provider).toMatchObject({
      id: 'api-route',
      apiKey: 'legacy-api-route-key',
      baseUrl: 'https://global.api-route.com/v1',
      proxy: 'http://localhost:8080',
      proxyMode: 'manual',
      enabled: true,
      connected: true,
      discoveredModels: [
        expect.objectContaining({ label: 'legacy-account-model', providerKind: 'api-route' }),
      ],
    });
    expect(mockGetSecret).toHaveBeenNthCalledWith(1, 'llmSettings', undefined);
    expect(mockGetSecret).toHaveBeenNthCalledWith(2, 'aiConfigs', []);
    expect(mockSetSecret).toHaveBeenCalledWith(
      'llmSettings',
      expect.objectContaining({ providers: expect.arrayContaining([provider]) }),
    );
  });

  it('adds the preset to persisted settings without resetting an existing provider', async () => {
    const store = useAppStore();
    const existing = JSON.parse(JSON.stringify(store.llmSettings));
    existing.providers = existing.providers.filter(
      (provider: { kind: string }) => provider.kind !== 'api-route',
    );
    existing.providers[0].apiKey = 'existing-openai-key';
    existing.providers[0].baseUrl = 'https://existing.example/v1';
    mockGetSecret.mockResolvedValueOnce(existing);

    await store.fetchLlmSettings();

    expect(store.providerConfigs.find(provider => provider.kind === 'api-route')).toMatchObject({
      baseUrl: 'https://global.api-route.com/v1',
      authMode: 'api-key',
      apiCompatibility: 'openai-compatible',
      connected: false,
    });
    expect(store.providerConfigs[0]).toMatchObject({
      apiKey: 'existing-openai-key',
      baseUrl: 'https://existing.example/v1',
    });
  });

  it('discovers account models through the shared OpenAI-compatible transport and saves them', async () => {
    const store = useAppStore();
    await store.updateProviderConfig('api-route', { apiKey: 'test-api-route-key' });
    mockListModels.mockResolvedValue(['gpt-6.1-sol', 'other/model']);

    const models = await store.syncProviderModels('api-route');

    expect(mockListModels).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai-compatible',
        apiKey: 'test-api-route-key',
        baseUrl: 'https://global.api-route.com/v1',
      }),
    );
    expect(models.map(model => model.label)).toEqual(['gpt-6.1-sol', 'other/model']);
    expect(models.every(model => model.providerKind === 'api-route')).toBe(true);
    expect(mockSetSecret).toHaveBeenLastCalledWith(
      'llmSettings',
      expect.objectContaining({
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'api-route', connected: true, discoveredModels: models }),
        ]),
      }),
    );
  });

  it('validates the selected model with the saved endpoint and key', async () => {
    const store = useAppStore();
    // api-route is opt-in, so the provider is enabled when the user adds it
    await store.updateProviderConfig('api-route', { apiKey: 'test-api-route-key', enabled: true });
    mockValidateConfig.mockResolvedValue({ valid: true });

    expect(await store.testProvider('api-route')).toEqual({ valid: true });
    expect(mockValidateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai-compatible',
        model: 'gpt-6.1-sol',
        baseUrl: 'https://global.api-route.com/v1',
        apiKey: 'test-api-route-key',
      }),
    );
  });

  it('marks a provider disconnected when model discovery fails', async () => {
    const store = useAppStore();
    await store.updateProviderConfig('api-route', { connected: true });
    mockListModels.mockRejectedValue(new Error('unauthorized'));

    await expect(store.syncProviderModels('api-route')).rejects.toThrow('unauthorized');
    expect(store.providerConfigs.find(provider => provider.id === 'api-route')?.connected).toBe(
      false,
    );
  });
});
