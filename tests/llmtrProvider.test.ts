import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { LLMTR: 'LLMTR' },
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

describe('LLMTR provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const llmtr = store.providerConfigs.find(provider => provider.kind === 'llmtr');

    expect(llmtr).toMatchObject({
      label: 'LLMTR',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://llmtr.com/v1',
      enabled: false,
      apiKey: '',
    });
    expect(llmtr?.discoveredModels.map(model => model.label)).toEqual([
      'qwen/qwen3.8-flash',
      'openai/gpt-5.4-mini',
      'anthropic/claude-sonnet-5',
    ]);
  });
});
