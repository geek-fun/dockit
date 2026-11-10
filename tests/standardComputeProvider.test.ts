import { createPinia, setActivePinia } from 'pinia';

jest.mock('../src/common', () => ({
  ...jest.requireActual('../src/common/constants'),
  pureObject: (value: unknown) => JSON.parse(JSON.stringify(value)),
  CustomError: Error,
  ErrorCodes: {},
}));
jest.mock('../src/lang', () => ({ lang: { t: (key: string) => key } }));
jest.mock('../src/datasources', () => ({
  ProviderEnum: { STANDARD_COMPUTE: 'STANDARD_COMPUTE' },
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

describe('Standard Compute provider preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('ships as an opt-in OpenAI-compatible preset', () => {
    const store = useAppStore();

    const standardCompute = store.providerConfigs.find(
      provider => provider.kind === 'standardcompute',
    );

    expect(standardCompute).toMatchObject({
      label: 'Standard Compute',
      apiCompatibility: 'openai-compatible',
      authMode: 'api-key',
      baseUrl: 'https://api.stdcmpt.com/v1',
      enabled: false,
      apiKey: '',
    });
    expect(standardCompute?.discoveredModels.map(model => model.label)).toEqual([
      'StandardCompute',
    ]);
  });
});
