import { createPinia, setActivePinia } from 'pinia';

const mockGetSecret = jest.fn();
const mockSetSecret = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDelete = jest.fn();
const mockListModels = jest.fn();
const mockValidateConfig = jest.fn();
const mockValidateLlmConfig = jest.fn();

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { CLOUDGPU: 'CLOUDGPU' },
  storeApi: {
    getSecret: (...args: unknown[]) => mockGetSecret(...args),
    setSecret: (...args: unknown[]) => mockSetSecret(...args),
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  chatBotApi: {
    listModels: (...args: unknown[]) => mockListModels(...args),
    validateConfig: (...args: unknown[]) => mockValidateConfig(...args),
  },
  validateLlmConfig: (...args: unknown[]) => mockValidateLlmConfig(...args),
}));

import { llmConnectionCheckProvider, useAppStore } from '../src/store/appStore';
import { ProviderEnum } from '../src/datasources';

describe('CloudGPU provider preset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActivePinia(createPinia());
    mockGetSecret.mockResolvedValue(undefined);
    mockSetSecret.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(undefined);
    mockSet.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const cloudgpu = store.providerConfigs.find(provider => provider.kind === 'cloudgpu');

    expect(cloudgpu).toMatchObject({
      label: 'CloudGPU',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://cloudgpu.app/v1',
      enabled: false,
      apiKey: '',
    });
    expect(cloudgpu?.discoveredModels.map(model => model.label)).toEqual([
      'deepseek-v4.1-flash',
      'deepseek-v4-pro',
      'kimi-k3',
      'kimi-k2.7-code',
      'glm-5.2',
      'minimax-m3',
      'qwen3-coder-480b',
      'qwen3.5-397b',
    ]);
  });

  it('routes CloudGPU credential checks away from the shared provider id', () => {
    expect(
      llmConnectionCheckProvider({
        kind: 'cloudgpu',
        apiCompatibility: 'openai-compatible',
      }),
    ).toBe('cloudgpu');
    expect(
      llmConnectionCheckProvider({
        kind: 'runcrate',
        apiCompatibility: 'openai-compatible',
      }),
    ).toBe('openai-compatible');
  });

  it('migrates a legacy CloudGPU config onto the preset', async () => {
    const store = useAppStore();
    mockGetSecret.mockResolvedValueOnce(undefined).mockResolvedValueOnce([
      {
        provider: ProviderEnum.CLOUDGPU,
        enabled: true,
        apiKey: 'legacy-cloudgpu-key',
        model: 'deepseek-v4.1-flash',
        httpProxy: '',
      },
    ]);

    await store.fetchLlmSettings();

    expect(store.providerConfigs.find(provider => provider.kind === 'cloudgpu')).toMatchObject({
      apiKey: 'legacy-cloudgpu-key',
      baseUrl: 'https://cloudgpu.app/v1',
      enabled: true,
      connected: true,
      discoveredModels: [expect.objectContaining({ label: 'deepseek-v4.1-flash' })],
    });
  });

  it('does not treat a public model catalog as a valid CloudGPU key', async () => {
    const store = useAppStore();
    await store.updateProviderConfig('cloudgpu', {
      apiKey: 'invalid-review-test-key',
      enabled: true,
    });
    mockListModels.mockResolvedValue(['deepseek-v4.1-flash', 'kimi-k3']);
    mockValidateConfig.mockResolvedValue({
      valid: false,
      error: 'HTTP 401 — invalid API key.',
    });

    await expect(store.testProvider('cloudgpu')).resolves.toEqual({
      valid: false,
      error: 'HTTP 401 — invalid API key.',
    });

    expect(mockListModels).not.toHaveBeenCalled();
    expect(mockValidateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'cloudgpu',
        apiKey: 'invalid-review-test-key',
        model: 'deepseek-v4.1-flash',
        baseUrl: 'https://cloudgpu.app/v1',
      }),
    );
    expect(store.providerConfigs.find(provider => provider.kind === 'cloudgpu')?.connected).toBe(
      false,
    );
  });

  it('marks CloudGPU connected only after the credential check succeeds', async () => {
    const store = useAppStore();
    await store.updateProviderConfig('cloudgpu', {
      apiKey: 'accepted-key',
      enabled: true,
    });
    mockValidateConfig.mockResolvedValue({ valid: true });

    await expect(store.testProvider('cloudgpu')).resolves.toEqual({ valid: true });
    expect(store.providerConfigs.find(provider => provider.kind === 'cloudgpu')?.connected).toBe(
      true,
    );
  });

  it('checks model availability with the CloudGPU credential path', async () => {
    const store = useAppStore();
    await store.updateProviderConfig('cloudgpu', {
      apiKey: 'invalid-review-test-key',
      enabled: true,
    });
    const modelId = store.providerConfigs.find(provider => provider.kind === 'cloudgpu')
      ?.discoveredModels[0]?.id;
    mockValidateLlmConfig.mockRejectedValue(new Error('HTTP 401 — invalid API key.'));

    await expect(store.verifyModelAvailability(modelId!)).resolves.toBe(false);
    expect(mockValidateLlmConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'cloudgpu',
        apiKey: 'invalid-review-test-key',
        model: 'deepseek-v4.1-flash',
        baseUrl: 'https://cloudgpu.app/v1',
      }),
    );
  });
});
