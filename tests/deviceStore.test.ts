import { setActivePinia, createPinia } from 'pinia';

let mockInvoke = jest.fn();

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockSetRefreshToken = jest.fn();

jest.mock('../src/store/userStore', () => ({
  useUserStore: () => ({
    isLoggedIn: true,
    accessToken: 'token-1',
    refreshToken: 'lease-1',
    setRefreshToken: mockSetRefreshToken,
  }),
}));

import { useDeviceStore, DEVICE_LIMIT_ERROR_TYPE } from '../src/store/deviceStore';

const mockLocalStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
};

let originalLocalStorage: Storage;

const limitPayload = {
  limit: 3,
  used: 3,
  devices: [
    {
      id: 'dev_old',
      name: 'Old Mac',
      platform: 'macos',
      activatedAt: '2026-09-01T00:00:00.000Z',
      lastSeenAt: '2026-09-10T00:00:00.000Z',
      isCurrent: false,
      status: 'active',
    },
    {
      id: 'dev_this',
      name: 'This Mac',
      platform: 'macos',
      isCurrent: true,
      status: 'active',
    },
  ],
  manageUrl: 'https://console/home/devices',
};

const activatedPayload = { deviceId: 'dev_new', limit: 3, used: 3, refreshToken: 'lease-2' };

describe('deviceStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = jest.fn();
    originalLocalStorage = global.localStorage;
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
  });

  it('should store the activated device on success', async () => {
    mockInvoke.mockResolvedValue(activatedPayload);
    const store = useDeviceStore();

    await store.ensureActivated(true);

    expect(mockInvoke).toHaveBeenCalledWith('activate_device', {
      token: 'token-1',
      refreshToken: 'lease-1',
      replaceDeviceId: null,
    });
    expect(store.isActivated).toBe(true);
    expect(store.deviceId).toBe('dev_new');
    expect(store.showReplaceDialog).toBe(false);
  });

  it('should surface the 5030 payload and open the replace dialog', async () => {
    mockInvoke.mockRejectedValue(
      JSON.stringify({
        error_type: DEVICE_LIMIT_ERROR_TYPE,
        code: 5030,
        limit_reached: limitPayload,
      }),
    );
    const store = useDeviceStore();

    await store.ensureActivated(true);

    expect(store.isActivated).toBe(false);
    expect(store.limitReached).toBe(true);
    expect(store.limitInfo?.devices).toHaveLength(2);
    expect(store.showReplaceDialog).toBe(true);
  });

  it('should stay silent on plain network errors', async () => {
    mockInvoke.mockRejectedValue('network error: timeout');
    const store = useDeviceStore();

    await store.ensureActivated(true);

    expect(store.limitReached).toBe(false);
    expect(store.showReplaceDialog).toBe(false);
  });

  it('should replace the picked device and close the dialog (F2)', async () => {
    const store = useDeviceStore();
    mockInvoke.mockRejectedValueOnce(
      JSON.stringify({
        error_type: DEVICE_LIMIT_ERROR_TYPE,
        code: 5030,
        limit_reached: limitPayload,
      }),
    );
    await store.ensureActivated(true);
    expect(store.showReplaceDialog).toBe(true);

    mockInvoke.mockResolvedValueOnce(activatedPayload);
    const ok = await store.replaceDevice('dev_old');

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenLastCalledWith('activate_device', {
      token: 'token-1',
      refreshToken: 'lease-1',
      replaceDeviceId: 'dev_old',
    });
    expect(store.deviceId).toBe('dev_new');
    expect(store.showReplaceDialog).toBe(false);
  });

  it('should refresh the list when a replace attempt hits 5030 again', async () => {
    const store = useDeviceStore();
    mockInvoke.mockRejectedValue(
      JSON.stringify({
        error_type: DEVICE_LIMIT_ERROR_TYPE,
        code: 5030,
        limit_reached: limitPayload,
      }),
    );
    const ok = await store.replaceDevice('dev_gone');

    expect(ok).toBe(false);
    expect(store.limitInfo?.devices).toHaveLength(2);
    expect(store.deviceId).toBe('');
  });

  it('should throttle non-forced activation within 24h of a success', async () => {
    mockInvoke.mockResolvedValue(activatedPayload);
    const store = useDeviceStore();

    // fresh install: the startup attempt goes through
    await store.ensureActivated(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // already activated this run — non-forced attempts are skipped
    await store.ensureActivated(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // a new app run (fresh store) whose last success is older than 24h retries
    setActivePinia(createPinia());
    localStorage.setItem('device_last_activated_at', String(Date.now() - 25 * 60 * 60 * 1000));
    const fresh = useDeviceStore();
    await fresh.ensureActivated(false);
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
