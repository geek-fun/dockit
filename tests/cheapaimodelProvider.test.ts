import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { CHEAPAIMODEL: 'CHEAPAIMODEL' },
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

describe('cheapaimodel provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const cheapaimodel = store.providerConfigs.find(provider => provider.kind === 'cheapaimodel');

    expect(cheapaimodel).toMatchObject({
      label: 'cheapaimodel',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://api.cheapaimodel.ai/v1',
      enabled: false,
      apiKey: '',
    });
    expect(cheapaimodel?.discoveredModels.map(model => model.label)).toEqual([
      'deepseek-v4-1-flash',
      'glm-5.3-flash',
      'kimi-k3',
    ]);
  });
});
