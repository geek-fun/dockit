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

// The presets that shipped enabled: true before this change, i.e. the cards an
// earlier release pre-added for every user.
const LEGACY_PRE_ADDED_KINDS = [
  'openrouter',
  'requesty',
  'opper',
  'atlascloud',
  'api-route',
  'cheaperinference',
  'gemini',
];

const patchProvider = (
  providers: Array<StoredProvider>,
  kind: string,
  patch: Record<string, unknown>,
) => {
  const provider = providers.find(item => item.kind === kind);
  if (!provider) throw new Error(`missing provider ${kind}`);
  Object.assign(provider, patch);
};

// Rebuild the payload a V1 install actually persisted: every legacy pre-added card
// enabled and untouched, still carrying its default model catalog.
const createV1Settings = (store: ReturnType<typeof useAppStore>) => {
  const stored = JSON.parse(JSON.stringify(store.llmSettings));
  LEGACY_PRE_ADDED_KINDS.forEach(kind =>
    patchProvider(stored.providers, kind, { enabled: true, apiKey: '', connected: false }),
  );
  return stored;
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

  it('un-enables every preset card an earlier release pre-added when unconfigured', async () => {
    const store = useAppStore();
    const stored = createV1Settings(store);
    // Explicitly configured cards keep their enabled flag.
    patchProvider(stored.providers, 'requesty', {
      enabled: true,
      apiKey: 'sk-requesty',
      connected: true,
    });
    patchProvider(stored.providers, 'opper', { enabled: true, apiKey: '', connected: true });
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(stored);

    await store.fetchLlmSettings();

    const enabled = (kind: string) =>
      store.providerConfigs.find(provider => provider.kind === kind)?.enabled;

    LEGACY_PRE_ADDED_KINDS.filter(kind => kind !== 'requesty' && kind !== 'opper').forEach(kind =>
      expect(enabled(kind)).toBe(false),
    );
    expect(enabled('requesty')).toBe(true);
    expect(enabled('opper')).toBe(true);
    expect(enabled('openai')).toBe(true);
  });

  it('persists the migrated providers before bumping the schema version', async () => {
    const store = useAppStore();
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(createV1Settings(store));

    await store.fetchLlmSettings();

    const settingsCall = mockSetSecret.mock.calls.find(([key]) => key === 'llmSettings');
    expect(settingsCall).toBeDefined();
    const persisted = settingsCall?.[1] as {
      providers: Array<{ kind: string; enabled: boolean }>;
    };
    const persistedEnabledKinds = persisted.providers
      .filter(provider => provider.enabled)
      .map(provider => provider.kind);
    expect(persistedEnabledKinds).toEqual(['openai', 'deepseek', 'ollama']);

    const versionIndex = mockStoreSet.mock.calls.findIndex(([key]) => key === 'llmSettingsVersion');
    expect(versionIndex).toBeGreaterThanOrEqual(0);
    expect(mockSetSecret.mock.invocationCallOrder[0]).toBeLessThan(
      mockStoreSet.mock.invocationCallOrder[versionIndex],
    );
  });

  it('does not bump the schema version when persisting the migration fails', async () => {
    const store = useAppStore();
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(createV1Settings(store));
    mockSetSecret.mockRejectedValueOnce(new Error('disk full'));

    await expect(store.fetchLlmSettings()).rejects.toThrow('disk full');

    expect(mockStoreSet).not.toHaveBeenCalled();
  });

  it('does not re-run the cleanup for users already on V2', async () => {
    const store = useAppStore();
    mockStoreGet.mockResolvedValue(2);
    mockGetSecret.mockResolvedValueOnce(createV1Settings(store));

    await store.fetchLlmSettings();

    expect(store.providerConfigs.find(provider => provider.kind === 'api-route')?.enabled).toBe(
      true,
    );
    expect(mockSetSecret).not.toHaveBeenCalled();
    expect(mockStoreSet).not.toHaveBeenCalled();
  });

  it('keeps keyless local providers the user added', async () => {
    const store = useAppStore();
    const stored = createV1Settings(store);
    patchProvider(stored.providers, 'lm-studio', {
      enabled: true,
      apiKey: '',
      connected: false,
      baseUrl: 'http://192.168.1.20:1234/v1',
    });
    mockStoreGet.mockResolvedValue(1);
    mockGetSecret.mockResolvedValueOnce(stored);

    await store.fetchLlmSettings();

    const lmStudio = store.providerConfigs.find(provider => provider.kind === 'lm-studio');
    expect(lmStudio?.enabled).toBe(true);
    expect(lmStudio?.baseUrl).toBe('http://192.168.1.20:1234/v1');
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
