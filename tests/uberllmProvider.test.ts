import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { UBERLLM: 'UBERLLM' },
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

describe('UberLLM provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const uberllm = store.providerConfigs.find(provider => provider.kind === 'uberllm');

    expect(uberllm).toMatchObject({
      label: 'UberLLM',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://api.uberllm.dev/v1',
      enabled: false,
      apiKey: '',
    });
    expect(uberllm?.discoveredModels.map(model => model.label)).toEqual([
      'deepseek/deepseek-v4-flash',
      'openai/gpt-5.4-mini',
      'anthropic/claude-sonnet-5',
    ]);
  });
});
