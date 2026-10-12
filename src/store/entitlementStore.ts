import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { isEntitlementError, isSessionRejected, type EntitlementView } from '../common';
import { useUserStore } from './userStore';

export type PlanState = 'ultimate' | 'community' | 'unknown' | 'checking';

const REFRESH_RETRY_DELAYS_MS = [1500, 3000, 6000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Terminal failure without a cached view — a synthetic answer so the UI
// lands on Unknown (with its retry CTA) instead of an endless Checking…
const unknownView = (lastError: string): EntitlementView => ({
  ultimateActive: false,
  versionLocked: false,
  localUltimate: false,
  appReleaseDate: '',
  ultimateExpiresAt: null,
  versionLockHorizon: null,
  cancelScheduledAt: null,
  cached: true,
  fetchedAtMs: null,
  lastError,
});

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
      const userStore = useUserStore();
      if (state.view?.localUltimate) return 'ultimate' as PlanState;
      if (!userStore.isLoggedIn) return 'unknown' as PlanState;
      // no server answer yet — the first refresh is still in flight
      if (state.view === null) return 'checking' as PlanState;
      if (state.view.lastError) return 'unknown' as PlanState;
      return 'community' as PlanState;
    },
    cancelScheduled: state => Boolean(state.view?.cancelScheduledAt),
    hasEntitlementError: state => Boolean(state.view?.lastError),
    // matches the plain-string errors Rust refresh_entitlement classifies by
    sessionExpired: state => {
      const err = state.view?.lastError;
      return err === 'session expired' || err === 'not logged in';
    },
  },
  actions: {
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
    // only a real server answer (fetchedAtMs) may surface as a confirmed plan
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
            // dead lease — drop it so the next login starts clean, and land
            // on the session-expired state instead of an endless Checking…
            userStore.setRefreshToken('');
            this.view = unknownView('session expired');
            return;
          }
          if (attempt >= REFRESH_RETRY_DELAYS_MS.length) {
            // terminal: a cached view degrades to itself (offline contract);
            // without one, surface Unknown rather than an endless Checking…
            if (!this.view) {
              this.view = unknownView(
                isEntitlementError(e)
                  ? 'entitlement check failed'
                  : typeof e === 'string'
                    ? e
                    : String(e),
              );
            }
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
