import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { RUNCRATE: 'RUNCRATE' },
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

describe('Runcrate provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const runcrate = store.providerConfigs.find(provider => provider.kind === 'runcrate');

    expect(runcrate).toMatchObject({
      label: 'Runcrate',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://api.runcrate.ai/v1',
      enabled: false,
      apiKey: '',
    });
    expect(runcrate?.discoveredModels.map(model => model.label)).toEqual([
      'deepseek-ai/DeepSeek-V4.1-Flash',
      'zai-org/GLM-5.3',
      'moonshotai/Kimi-K2.6',
    ]);
  });
});
