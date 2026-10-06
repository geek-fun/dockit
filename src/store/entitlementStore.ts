import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { isEntitlementError, isSessionRejected, type EntitlementView } from '../common';
import { useUserStore } from './userStore';

export type PlanState = 'ultimate' | 'community' | 'unknown';

// Bounded self-heal for the login window: the first refresh right after a
// deep-link login can race the backend provisioning the subscription (or hit
// a transient network error) — retry before giving up and showing Unknown.
const REFRESH_RETRY_DELAYS_MS = [1500, 3000, 6000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useEntitlementStore = defineStore('entitlement', {
  state: (): { view: EntitlementView | null } => ({
    view: null,
  }),
  getters: {
    isLocalUltimate: state => state.view?.localUltimate ?? false,
    isCloudUltimate: state => state.view?.ultimateActive ?? false,
    // 'community' is only claimed when the server answered; a failed or
    // missing check must never masquerade as a confirmed plan.
    planState: state => {
      if (state.view?.localUltimate) return 'ultimate' as PlanState;
      if (state.view === null || state.view.lastError) return 'unknown' as PlanState;
      return 'community' as PlanState;
    },
    cancelScheduled: state => Boolean(state.view?.cancelScheduledAt),
    hasEntitlementError: state => Boolean(state.view?.lastError),
    // The server classified the session as unrecoverable (401 with no
    // lease to rotate) — only a fresh web login can verify the plan again.
    sessionExpired: state => {
      const err = state.view?.lastError;
      return err === 'session expired' || err === 'not logged in';
    },
  },
  actions: {
    // Instant plan display right after a deep-link login: the web handoff
    // carries an entitlement snapshot alongside the token. Seeding is
    // best-effort — the server stays the source of truth and the regular
    // refresh still verifies right after.
    async seedFromHandoff(payload: {
      ultimateExpiresAt?: string | null;
      versionLockHorizon?: string | null;
      cancelScheduledAt?: string | null;
    }): Promise<void> {
      const { ultimateExpiresAt, versionLockHorizon, cancelScheduledAt } = payload;
      if (!ultimateExpiresAt && !versionLockHorizon) {
        return;
      }
      try {
        this.view = await invoke<EntitlementView>('seed_entitlement', {
          ultimateExpiresAt: ultimateExpiresAt ?? null,
          versionLockHorizon: versionLockHorizon ?? null,
          cancelScheduledAt: cancelScheduledAt ?? null,
        });
      } catch {
        // best effort — the refresh below still verifies
      }
    },
    // Show the persisted last success instantly at startup (Rust keeps an
    // entitlement-cache.json across restarts). A cache entry always carries a
    // fetchedAtMs from a real server answer; an empty Rust state returns null
    // and must NOT surface as a confirmed 'community'.
    async hydrate(): Promise<void> {
      const cached = await invoke<EntitlementView>('get_entitlement').catch(() => null);
      if (cached?.fetchedAtMs != null) {
        this.view = cached;
      }
    },
    async refreshEntitlement(force = false): Promise<void> {
      const userStore = useUserStore();
      for (let attempt = 0; ; attempt += 1) {
        try {
          this.view = await invoke<EntitlementView>('refresh_entitlement', {
            token: userStore.accessToken,
            refreshToken: userStore.refreshToken || null,
            force,
          });
          return;
        } catch (e) {
          if (isSessionRejected(e)) {
            // The lease is dead server-side — drop it so the next login starts
            // clean instead of presenting a revoked token. Retrying is pointless.
            userStore.setRefreshToken('');
            this.view = null;
            return;
          }
          if (attempt >= REFRESH_RETRY_DELAYS_MS.length) {
            if (!isEntitlementError(e)) {
              throw e;
            }
            this.view = null;
            return;
          }
          await sleep(REFRESH_RETRY_DELAYS_MS[attempt]);
        }
      }
    },
    async clearCachedEntitlement(): Promise<void> {
      try {
        await invoke<EntitlementView>('clear_entitlement');
      } catch {
        // best effort — the local view reset below always applies
      }
      this.view = null;
    },
  },
});
