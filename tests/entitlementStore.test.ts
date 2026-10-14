import { setActivePinia, createPinia } from 'pinia';

let mockInvoke = jest.fn();

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockSetToken = jest.fn();
const mockSetRefreshToken = jest.fn();
const mockResetToken = jest.fn();

jest.mock('../src/store/userStore', () => ({
  useUserStore: () => ({
    isLoggedIn: true,
    accessToken: 'token-1',
    refreshToken: 'lease-1',
    setToken: mockSetToken,
    setRefreshToken: mockSetRefreshToken,
    resetToken: mockResetToken,
  }),
}));

import { useEntitlementStore } from '../src/store/entitlementStore';
import { ENTITLEMENT_ERROR_TYPE, SESSION_REJECTED_ERROR_TYPE } from '../src/common/entitlement';
import type { EntitlementView } from '../src/common/entitlement';

const view = (overrides: Partial<EntitlementView> = {}): EntitlementView => ({
  ultimateActive: false,
  versionLocked: false,
  localUltimate: false,
  appReleaseDate: '2026-09-11',
  ultimateExpiresAt: null,
  versionLockHorizon: null,
  cancelScheduledAt: null,
  cached: true,
  fetchedAtMs: 123,
  sessionPhase: null,
  lastError: null,
  ...overrides,
});

const rejected = (errorType: string, message: string) =>
  JSON.stringify({ status: 401, error_type: errorType, message });

describe('entitlementStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // the userStore token mutators are file-level fns shared by the mock —
    // keep each case's assertions independent of previous call records
    jest.clearAllMocks();
    mockInvoke = jest.fn();
    // void-commands (revoke/clear) default to a resolved promise;
    // each test overrides per invocation name/value.
    mockInvoke.mockResolvedValue(undefined);
  });

  describe('hydrate', () => {
    it('applies only a real server answer (fetchedAtMs present)', async () => {
      mockInvoke.mockResolvedValue(view({ fetchedAtMs: null }));
      const store = useEntitlementStore();

      await store.hydrate();

      // an empty Rust state must not masquerade as a confirmed plan
      expect(store.view).toBeNull();

      mockInvoke.mockResolvedValue(view({ localUltimate: true, fetchedAtMs: 42 }));
      await store.hydrate();

      expect(store.view?.fetchedAtMs).toBe(42);
      expect(store.isLocalUltimate).toBe(true);
    });

    it('stays silent when the cache read fails', async () => {
      mockInvoke.mockRejectedValue('read error');
      const store = useEntitlementStore();

      await expect(store.hydrate()).resolves.toBeUndefined();
      expect(store.view).toBeNull();
    });
  });

  describe('seedFromHandoff', () => {
    it('skips the command when the handoff carries no snapshot', async () => {
      const store = useEntitlementStore();

      await store.seedFromHandoff({});

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('maps the snapshot fields onto the seed command', async () => {
      mockInvoke.mockResolvedValue(view());
      const store = useEntitlementStore();

      await store.seedFromHandoff({
        ultimateExpiresAt: '2027-09-10T00:00:00.000Z',
        versionLockHorizon: null,
        cancelScheduledAt: null,
      });

      expect(mockInvoke).toHaveBeenCalledWith('seed_entitlement', {
        ultimateExpiresAt: '2027-09-10T00:00:00.000Z',
        versionLockHorizon: null,
        cancelScheduledAt: null,
      });
      expect(store.view?.fetchedAtMs).toBe(123);
    });

    it('is best-effort — a seeding failure is swallowed', async () => {
      mockInvoke.mockRejectedValue('seed error');
      const store = useEntitlementStore();

      await expect(
        store.seedFromHandoff({ ultimateExpiresAt: '2027-09-10T00:00:00.000Z' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('refreshEntitlement', () => {
    it('stores the fresh view', async () => {
      mockInvoke.mockResolvedValue(view({ localUltimate: true }));
      const store = useEntitlementStore();

      await store.refreshEntitlement(true);

      expect(mockInvoke).toHaveBeenCalledWith('refresh_entitlement', {
        token: 'token-1',
        refreshToken: 'lease-1',
        force: true,
      });
      expect(store.isLocalUltimate).toBe(true);
      expect(store.planState).toBe('ultimate');
    });

    it('resolves a deliberately rejected lease to a full sign-out — no retry', async () => {
      mockInvoke.mockRejectedValue(rejected(SESSION_REJECTED_ERROR_TYPE, 'lease expired'));
      const store = useEntitlementStore();

      await store.refreshEntitlement(false);

      const refreshCalls = mockInvoke.mock.calls.filter(([name]) => name === 'refresh_entitlement');
      expect(refreshCalls).toHaveLength(1); // rejected sessions are terminal — no retry
      expect(mockInvoke).toHaveBeenCalledWith('revoke_session', { refreshToken: 'lease-1' });
      expect(mockInvoke).toHaveBeenCalledWith('clear_entitlement');
      expect(mockResetToken).toHaveBeenCalled();
      expect(store.view).toBeNull();
      expect(store.sessionLostNotice).toBeGreaterThan(0);
    });

    it('retries a transient failure and succeeds', async () => {
      jest.useFakeTimers();
      mockInvoke
        .mockRejectedValueOnce('network error: timeout')
        .mockResolvedValueOnce(view({ ultimateActive: true, localUltimate: true }));
      const store = useEntitlementStore();

      const pending = store.refreshEntitlement(false);
      await jest.runAllTimersAsync();
      await pending;

      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(store.isCloudUltimate).toBe(true);
      expect(store.planState).toBe('ultimate');
    });

    it('lands on Unknown after persistent non-entitlement failures', async () => {
      jest.useFakeTimers();
      mockInvoke.mockRejectedValue('network error: timeout');
      const store = useEntitlementStore();

      const pending = store.refreshEntitlement(false);
      await jest.runAllTimersAsync();
      await pending;

      expect(mockInvoke).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
      expect(store.view).not.toBeNull();
      expect(store.planState).toBe('unknown');
      expect(store.hasEntitlementError).toBe(true);
      expect(store.sessionExpired).toBe(false);
    });

    it('keeps a hydrated cached view when the refresh degrades', async () => {
      mockInvoke.mockResolvedValueOnce(view({ localUltimate: true, fetchedAtMs: 42 }));
      const store = useEntitlementStore();
      await store.hydrate();

      jest.useFakeTimers();
      mockInvoke.mockRejectedValue('network error: timeout');
      const pending = store.refreshEntitlement(false);
      await jest.runAllTimersAsync();
      await pending;

      // offline contract: the last success stays on screen
      expect(store.view?.fetchedAtMs).toBe(42);
      expect(store.isLocalUltimate).toBe(true);
      expect(store.hasEntitlementError).toBe(false);
    });

    it('resolves an unrenewable bearer (401 with no lease) to a full sign-out', async () => {
      // Rust answers Ok with a degraded view when the lease is gone and the
      // bearer can no longer serve — the store must not leave a half-dead
      // session behind.
      mockInvoke.mockImplementation((name: string) => {
        if (name === 'refresh_entitlement') {
          return Promise.resolve(view({ lastError: 'session expired', sessionPhase: 'expired' }));
        }
        return Promise.resolve(undefined);
      });
      const store = useEntitlementStore();

      await store.refreshEntitlement(false);

      expect(mockInvoke).toHaveBeenCalledWith('revoke_session', { refreshToken: 'lease-1' });
      expect(mockInvoke).toHaveBeenCalledWith('clear_entitlement');
      expect(mockResetToken).toHaveBeenCalled();
      expect(store.view).toBeNull();
      expect(store.sessionLostNotice).toBeGreaterThan(0);
    });

    it('resolves with Unknown for a definitive entitlement answer', async () => {
      jest.useFakeTimers();
      mockInvoke.mockRejectedValue(rejected(ENTITLEMENT_ERROR_TYPE, 'requires Ultimate'));
      const store = useEntitlementStore();

      const pending = store.refreshEntitlement(false);
      await jest.runAllTimersAsync();
      await pending;

      expect(store.planState).toBe('unknown');
      expect(store.sessionExpired).toBe(false);
    });
  });

  describe('attemptSessionRecovery', () => {
    it('rotates the lease first, then a successful refresh recovers', async () => {
      mockInvoke.mockImplementation((name: string) => {
        if (name === 'rotate_session_now') {
          return Promise.resolve({ access_token: 'token-2', refresh_token: 'lease-2' });
        }
        if (name === 'refresh_entitlement') {
          return Promise.resolve(view({ localUltimate: true, sessionPhase: 'signed-in' }));
        }
        return Promise.resolve(undefined);
      });
      const store = useEntitlementStore();

      const outcome = await store.attemptSessionRecovery();

      expect(outcome).toBe('recovered');
      expect(mockInvoke).toHaveBeenCalledWith('rotate_session_now', { refreshToken: 'lease-1' });
      expect(mockSetToken).toHaveBeenCalledWith('token-2');
      expect(mockSetRefreshToken).toHaveBeenCalledWith('lease-2');
    });

    it('resolves a rejected rotation as a definite loss without re-checking', async () => {
      mockInvoke.mockImplementation((name: string) => {
        if (name === 'rotate_session_now') {
          return Promise.reject(rejected(SESSION_REJECTED_ERROR_TYPE, 'reuse detected'));
        }
        return Promise.resolve(undefined);
      });
      const store = useEntitlementStore();

      const outcome = await store.attemptSessionRecovery();

      expect(outcome).toBe('lost');
      expect(mockResetToken).toHaveBeenCalled();
      expect(store.sessionLostNotice).toBeGreaterThan(0);
      const refreshCalls = mockInvoke.mock.calls.filter(([name]) => name === 'refresh_entitlement');
      expect(refreshCalls).toHaveLength(0);
    });

    it('treats a transient rotation failure as recoverable — falls back to the existing bearer', async () => {
      mockInvoke.mockImplementation((name: string) => {
        if (name === 'rotate_session_now') {
          return Promise.reject('network error: timeout');
        }
        if (name === 'refresh_entitlement') {
          return Promise.resolve(view({ localUltimate: true, sessionPhase: 'signed-in' }));
        }
        return Promise.resolve(undefined);
      });
      const store = useEntitlementStore();

      const outcome = await store.attemptSessionRecovery();

      expect(outcome).toBe('recovered');
      expect(mockSetToken).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledWith('refresh_entitlement', {
        token: 'token-1',
        refreshToken: 'lease-1',
        force: true,
      });
    });

    it('resolves an expired re-verification answer to a definite loss', async () => {
      mockInvoke.mockImplementation((name: string) => {
        if (name === 'refresh_entitlement') {
          return Promise.resolve(view({ lastError: 'session expired', sessionPhase: 'expired' }));
        }
        return Promise.resolve(undefined);
      });
      const store = useEntitlementStore();

      const outcome = await store.attemptSessionRecovery();

      expect(outcome).toBe('lost');
      expect(mockResetToken).toHaveBeenCalled();
      expect(store.view).toBeNull();
    });
  });

  describe('plan classification', () => {
    it('marks checking before any server answer, unknown on a failed check', () => {
      const store = useEntitlementStore();

      expect(store.planState).toBe('checking');

      store.$patch({ view: view({ lastError: 'network error: timeout' }) });
      expect(store.planState).toBe('unknown');
      expect(store.sessionExpired).toBe(false);
      expect(store.hasEntitlementError).toBe(true);

      // the session verdict is structured — lastError strings no longer match
      store.$patch({
        view: view({ lastError: 'session expired', sessionPhase: 'expired' }),
      });
      expect(store.sessionExpired).toBe(true);

      store.$patch({
        view: view({ lastError: 'session expired', sessionPhase: 'signed-in' }),
      });
      expect(store.sessionExpired).toBe(false);

      store.$patch({ view: view() });
      expect(store.planState).toBe('community');
      expect(store.sessionExpired).toBe(false);
    });

    it('resets the view on clearCachedEntitlement', async () => {
      mockInvoke.mockResolvedValue(view({ localUltimate: true }));
      const store = useEntitlementStore();
      await store.refreshEntitlement(false);
      expect(store.view).not.toBeNull();

      mockInvoke.mockResolvedValue(view({ fetchedAtMs: null }));
      await store.clearCachedEntitlement();

      expect(mockInvoke).toHaveBeenCalledWith('clear_entitlement');
      expect(store.view).toBeNull();
    });
  });
});
