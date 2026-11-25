import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { ONOMEO: 'ONOMEO' },
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

describe('onomeo provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const onomeo = store.providerConfigs.find(provider => provider.kind === 'onomeo');

    expect(onomeo).toMatchObject({
      label: 'onomeo',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://onomeo.com/v1',
      enabled: false,
      apiKey: '',
    });
    expect(onomeo?.discoveredModels.map(model => model.label)).toEqual([
      'deepseek-v4.1-flash',
      'claude-sonnet-5.5',
      'gpt-6.2-sol',
    ]);
  });
});
