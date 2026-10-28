import { createPinia, setActivePinia } from 'pinia';

let mockInvoke = jest.fn();
jest.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

const fixture = () => {
  const account = (
    jest.requireActual('../src/store/userStore') as typeof import('../src/store/userStore')
  ).useUserStore();
  const device = (
    jest.requireActual('../src/store/deviceStore') as typeof import('../src/store/deviceStore')
  ).useDeviceStore();
  const entitlement = (
    jest.requireActual(
      '../src/store/entitlementStore',
    ) as typeof import('../src/store/entitlementStore')
  ).useEntitlementStore();
  account.setAuth('first-access', 'First', 'first@example.test');
  account.setRefreshToken('first-lease');
  return { account, device, entitlement };
};

const deferred = <T>() => {
  let resolve!: (_value: T) => void;
  let reject!: (_error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { resolve, reject, promise };
};

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => data.set(key, value),
  removeItem: (key: string) => data.delete(key),
};

beforeEach(() => {
  data.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  setActivePinia(createPinia());
  mockInvoke = jest.fn().mockResolvedValue(undefined);
});

describe('session ownership across asynchronous operations', () => {
  it('persists credentials returned by entitlement renewal even if its event was missed', async () => {
    const { account, entitlement } = fixture();
    mockInvoke.mockResolvedValue({
      sessionPhase: 'signed-in',
      refreshedSession: {
        previous_refresh_token: 'first-lease',
        access_token: 'renewed-access',
        refresh_token: 'renewed-lease',
      },
    });
    await entitlement.refreshEntitlement(true);
    expect(account.refreshToken).toBe('renewed-lease');
    expect(account.accessToken).toBe('renewed-access');
  });

  it('accepts the renewed bearer returned by activation without relying on its event', async () => {
    const { account, device } = fixture();
    mockInvoke.mockResolvedValue({
      deviceId: 'device',
      limit: 3,
      used: 1,
      accessToken: 'renewed-access',
      refreshToken: 'renewed-lease',
    });
    await device.ensureActivated(true);
    expect(account.accessToken).toBe('renewed-access');
    expect(account.refreshToken).toBe('renewed-lease');
  });
  it('ignores a previous login rotation rejection during manual recovery', async () => {
    const { account, entitlement } = fixture();
    const rotation = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(rotation.promise);
    const pending = entitlement.attemptSessionRecovery();
    account.setAuth('new', 'New', 'new@example.test');
    rotation.reject(JSON.stringify({ error_type: 'SESSION_REJECTED' }));
    await pending;
    expect(account.isLoggedIn).toBe(true);
    expect(entitlement.sessionRejections).toBe(0);
  });

  it('ignores manual recovery rejection for an already replaced lease', async () => {
    const { account, entitlement } = fixture();
    const rotation = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(rotation.promise);
    const pending = entitlement.attemptSessionRecovery();
    account.applySessionRefresh('first-lease', 'new', 'new-lease');
    rotation.reject(JSON.stringify({ error_type: 'SESSION_REJECTED' }));
    await pending;
    expect(entitlement.sessionRejections).toBe(0);
    expect(account.refreshToken).toBe('new-lease');
  });

  it('does not hydrate a cache result into a newer login', async () => {
    const { account, entitlement } = fixture();
    const cached = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(cached.promise);
    const pending = entitlement.hydrate();
    account.setAuth('new', 'New', 'new@example.test');
    cached.resolve({ fetchedAtMs: 42 });
    await pending;
    expect(entitlement.view).toBeNull();
  });

  it('does not apply a handoff seed after logout', async () => {
    const { account, entitlement } = fixture();
    const seeded = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(seeded.promise);
    const pending = entitlement.seedFromHandoff({ ultimateExpiresAt: '2099-01-01' });
    account.resetToken();
    seeded.resolve({ fetchedAtMs: 42 });
    await pending;
    expect(entitlement.view).toBeNull();
  });

  it('does not display an activation failure from an earlier login', async () => {
    const { account, device } = fixture();
    const activation = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(activation.promise);
    const pending = device.ensureActivated(true);
    account.setAuth('new', 'New', 'new@example.test');
    activation.reject('session expired');
    await pending;
    expect(device.activationError).toBeNull();
  });

  it('does not apply a replace result from an earlier login', async () => {
    const { account, device } = fixture();
    const activation = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(activation.promise);
    const pending = device.replaceDevice('old-device');
    account.resetToken();
    activation.resolve({ deviceId: 'late', refreshToken: 'late' });
    expect(await pending).toBe(false);
    expect(account.refreshToken).toBe('');
  });

  it('persists an activated lease and restores it into a fresh app session', async () => {
    const { createApp } = jest.requireActual('vue') as typeof import('vue');
    const persisted = jest.requireActual('pinia-plugin-persistedstate');
    const install = () => {
      const pinia = createPinia();
      pinia.use(persisted.createPersistedState({ storage }));
      createApp({}).use(pinia);
      setActivePinia(pinia);
    };
    install();
    const { account, device } = fixture();
    mockInvoke.mockResolvedValue({
      deviceId: 'device',
      limit: 3,
      used: 1,
      refreshToken: 'persisted-lease',
    });
    await device.ensureActivated(true);
    expect(JSON.parse(localStorage.getItem('user')!).refreshToken).toBe('persisted-lease');
    install();
    const restored = (
      jest.requireActual('../src/store/userStore') as typeof import('../src/store/userStore')
    ).useUserStore();
    expect(restored.refreshToken).toBe('persisted-lease');
    expect(restored.accessToken).toBe(account.accessToken);
    expect(restored.sessionRevision).toBe(0);
  });

  it('ignores an expired response when another request has already renewed its lease', async () => {
    const { account, entitlement } = fixture();
    const request = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(request.promise);
    const pending = entitlement.refreshEntitlement(true);
    account.applySessionRefresh('first-lease', 'new-access', 'new-lease');
    request.resolve({ sessionPhase: 'expired' });
    await pending;
    expect(entitlement.view).toBeNull();
    expect(account.refreshToken).toBe('new-lease');
  });
  it('only applies a rotation to the lease that requested it', () => {
    const { account } = fixture();
    account.applySessionRefresh('first-lease', 'next-access', 'next-lease');
    expect(account.refreshToken).toBe('next-lease');
    account.applySessionRefresh('first-lease', 'stale-access', 'stale-lease');
    expect(account.refreshToken).toBe('next-lease');
    account.resetToken();
    account.applySessionRefresh('next-lease', 'late-access', 'late-lease');
    expect(account.isLoggedIn).toBe(false);
    expect(account.refreshToken).toBe('');
  });

  it.each(['expired', 'rejected', 'healthy'])(
    'ignores a delayed %s answer from a previous login',
    async result => {
      const { account, entitlement } = fixture();
      const request = deferred<unknown>();
      mockInvoke.mockReturnValueOnce(request.promise);
      const pending = entitlement.refreshEntitlement(true);
      account.setAuth('new-access', 'New', 'new@example.test');
      account.setRefreshToken('new-lease');
      if (result === 'rejected') request.reject(JSON.stringify({ error_type: 'SESSION_REJECTED' }));
      else request.resolve({ sessionPhase: result === 'expired' ? 'expired' : 'signed-in' });
      await pending;
      expect(account.isLoggedIn).toBe(true);
      expect(account.refreshToken).toBe('new-lease');
      expect(entitlement.view).toBeNull();
    },
  );

  it('does not let a delayed cache clear wipe a new login or plan', async () => {
    const { account, entitlement } = fixture();
    const clearing = deferred<unknown>();
    mockInvoke.mockImplementation(name =>
      name === 'clear_entitlement' ? clearing.promise : Promise.resolve(),
    );
    const pending = entitlement.clearSessionState();
    expect(account.isLoggedIn).toBe(false);
    account.setAuth('new-access', 'New', 'new@example.test');
    const nextView = { sessionPhase: 'signed-in' } as NonNullable<typeof entitlement.view>;
    entitlement.view = nextView;
    clearing.resolve(undefined);
    await pending;
    expect(account.isLoggedIn).toBe(true);
    expect(entitlement.view).toEqual(nextView);
  });

  it('repairs an access-only session despite a recent activation timestamp', async () => {
    const { account, device } = fixture();
    account.setRefreshToken('');
    localStorage.setItem('device_last_activated_at', String(Date.now()));
    mockInvoke.mockResolvedValue({
      deviceId: 'device',
      limit: 3,
      used: 1,
      refreshToken: 'repaired-lease',
    });
    await device.ensureActivated();
    expect(account.refreshToken).toBe('repaired-lease');
  });

  it('ignores activation completion after logout', async () => {
    const { account, device } = fixture();
    const activation = deferred<unknown>();
    mockInvoke.mockReturnValueOnce(activation.promise);
    const pending = device.ensureActivated(true);
    account.resetToken();
    activation.resolve({ deviceId: 'old-device', limit: 3, used: 1, refreshToken: 'old-lease' });
    await pending;
    expect(account.refreshToken).toBe('');
    expect(device.deviceId).toBe('');
  });

  it('allows a new login to activate while the previous activation is pending', async () => {
    const { account, device } = fixture();
    const previous = deferred<unknown>();
    mockInvoke
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValue({ deviceId: 'new-device', limit: 3, used: 1, refreshToken: 'new-lease' });
    const pending = device.ensureActivated(true);
    account.setAuth('new-access', 'New', 'new@example.test');
    await device.ensureActivated(true);
    previous.resolve({ deviceId: 'old-device', limit: 3, used: 1, refreshToken: 'old-lease' });
    await pending;
    expect(account.refreshToken).toBe('new-lease');
    expect(device.deviceId).toBe('new-device');
  });
});
