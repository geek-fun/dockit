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
  lastError: null,
  ...overrides,
});

const rejected = (errorType: string, message: string) =>
  JSON.stringify({ status: 401, error_type: errorType, message });

describe('entitlementStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockInvoke = jest.fn();
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

    it('drops the lease immediately on session rejection — no retry', async () => {
      mockInvoke.mockRejectedValue(rejected(SESSION_REJECTED_ERROR_TYPE, 'lease expired'));
      const store = useEntitlementStore();

      await store.refreshEntitlement(false);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockSetRefreshToken).toHaveBeenCalledWith('');
      expect(store.view).toBeNull();
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

    it('rethrows a persistent non-entitlement failure with the view left empty', async () => {
      jest.useFakeTimers();
      mockInvoke.mockRejectedValue('network error: timeout');
      const store = useEntitlementStore();

      const pending = store.refreshEntitlement(false);
      // attach the rejection handler before the timers fire the retries
      const assertion = expect(pending).rejects.toBe('network error: timeout');
      await jest.runAllTimersAsync();
      await assertion;

      expect(mockInvoke).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
      expect(store.view).toBeNull();
    });

    it('resolves with an empty view for a definitive entitlement answer', async () => {
      jest.useFakeTimers();
      mockInvoke.mockRejectedValue(rejected(ENTITLEMENT_ERROR_TYPE, 'requires Ultimate'));
      const store = useEntitlementStore();

      const pending = store.refreshEntitlement(false);
      await jest.runAllTimersAsync();

      await expect(pending).resolves.toBeUndefined();
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

      store.$patch({ view: view({ lastError: 'session expired' }) });
      expect(store.sessionExpired).toBe(true);

      store.$patch({ view: view({ lastError: 'not logged in' }) });
      expect(store.sessionExpired).toBe(true);

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
