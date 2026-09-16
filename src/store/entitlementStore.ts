import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { isEntitlementError, isSessionRejected, type EntitlementView } from '../common';
import { useUserStore } from './userStore';

export type PlanState = 'ultimate' | 'community';

export const useEntitlementStore = defineStore('entitlement', {
  state: (): { view: EntitlementView | null } => ({
    view: null,
  }),
  getters: {
    isLocalUltimate: state => state.view?.localUltimate ?? false,
    isCloudUltimate: state => state.view?.ultimateActive ?? false,
    planState: state =>
      state.view?.localUltimate ? ('ultimate' as PlanState) : ('community' as PlanState),
    cancelScheduled: state => Boolean(state.view?.cancelScheduledAt),
    hasEntitlementError: state => Boolean(state.view?.lastError),
  },
  actions: {
    async refreshEntitlement(force = false): Promise<void> {
      const userStore = useUserStore();
      try {
        this.view = await invoke<EntitlementView>('refresh_entitlement', {
          token: userStore.accessToken,
          refreshToken: userStore.refreshToken || null,
          force,
        });
      } catch (e) {
        if (isSessionRejected(e)) {
          // The lease is dead server-side — drop it so the next login starts
          // clean instead of presenting a revoked token.
          userStore.setRefreshToken('');
        }
        if (!isEntitlementError(e) && !isSessionRejected(e)) {
          throw e;
        }
        this.view = null;
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
