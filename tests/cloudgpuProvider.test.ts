import { createPinia, setActivePinia } from 'pinia';

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
    getSecret: jest.fn(),
    setSecret: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
  chatBotApi: { listModels: jest.fn(), validateConfig: jest.fn() },
  validateLlmConfig: jest.fn(),
}));

import { useAppStore } from '../src/store/appStore';

describe('CloudGPU provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
});
