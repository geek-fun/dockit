import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import {
  isEntitlementError,
  isSessionRejected,
  sessionPhaseFromTokens,
  type EntitlementView,
  type SessionPhase,
} from '../common';
import { useUserStore } from './userStore';
import { useDeviceStore } from './deviceStore';

export type PlanState = 'ultimate' | 'community' | 'unknown' | 'checking';

const REFRESH_RETRY_DELAYS_MS = [1500, 3000, 6000];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Terminal failure without a cached view — a synthetic answer so the UI
// lands on Unknown (with its retry CTA) instead of an endless Checking…
const unknownView = (lastError: string, sessionPhase: SessionPhase): EntitlementView => ({
  ultimateActive: false,
  versionLocked: false,
  localUltimate: false,
  appReleaseDate: '',
  ultimateExpiresAt: null,
  versionLockHorizon: null,
  cancelScheduledAt: null,
  cached: true,
  fetchedAtMs: null,
  sessionPhase,
  lastError,
});

export const useEntitlementStore = defineStore('entitlement', {
  state: (): {
    view: EntitlementView | null;
    sessionLostNotice: number;
    sessionRejections: number;
  } => ({
    view: null,
    // Timestamp of the last definite session loss (set by handleSessionLoss);
    // the AppProvider layer surfaces the signed-out toast from it.
    sessionLostNotice: 0,
    // Consecutive deliberate rotation rejections before a session loss is
    // resolved — one rejection lands degraded, two in a row clear.
    sessionRejections: 0,
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
    // Single session-health derivation (token facts + the structured server
    // verdict) — every login-CTA / degraded-plan consumer reads this instead
    // of matching lastError strings.
    sessionPhase: state => {
      const userStore = useUserStore();
      return sessionPhaseFromTokens(
        userStore.accessToken,
        userStore.refreshToken,
        state.view?.sessionPhase ?? null,
      );
    },
    sessionExpired(): boolean {
      return this.sessionPhase === 'expired';
    },
  },
  actions: {
    // Shared teardown for an account session — best-effort server-side lease
    // revocation, cached entitlements, profile identity, device registration.
    // Local teardown is synchronous and instant so the UI flips immediately;
    // the revocation is a deliberate no-op on failure and never blocks it.
    async clearSessionState(): Promise<void> {
      const userStore = useUserStore();
      const lease = userStore.refreshToken || null;
      userStore.resetToken();
      this.sessionRejections = 0;
      useDeviceStore().$reset();
      void invoke('revoke_session', { refreshToken: lease }).catch(() => {});
      await this.clearCachedEntitlement();
    },
    // The session is definitively unrenewable (the server rejected the lease,
    // or the bearer is dead with no lease to rotate): wipe local state so the
    // UI returns to the logged-out look; AppProvider toasts from the notice.
    async handleSessionLoss(): Promise<void> {
      const userStore = useUserStore();
      const hadIdentity = userStore.isLoggedIn;
      const clearing = this.clearSessionState();
      if (hadIdentity) {
        this.sessionLostNotice = Date.now();
      }
      await clearing;
    },
    // A deliberate rotation rejection is server policy, not transient — but a
    // single one only lands on the degraded login-CTA state; two in a row
    // resolve the whole session (guards against a brief auth-gateway
    // misclassification wiping a healthy account). Success resets the count.
    async resolveSessionRejection(): Promise<void> {
      this.sessionRejections += 1;
      this.view = unknownView('session expired', 'expired');
      if (this.sessionRejections < 2) {
        return;
      }
      await this.handleSessionLoss();
    },
    // Active recovery for a degraded session: rotate the lease while one
    // exists, then force an entitlement refresh. A deliberate rotation
    // rejection (or a still-expired phase afterwards) is a definite loss and
    // resolves the whole session; transient errors leave the cached state for
    // the caller's retry CTA.
    async attemptSessionRecovery(): Promise<'recovered' | 'lost'> {
      const userStore = useUserStore();
      const revision = userStore.sessionRevision;
      const lease = userStore.refreshToken || '';
      if (lease.trim()) {
        try {
          const refreshed = await invoke<{ access_token: string; refresh_token: string }>(
            'rotate_session_now',
            { refreshToken: lease },
          );
          if (userStore.sessionRevision !== revision) return 'recovered';
          userStore.applySessionRefresh(lease, refreshed.access_token, refreshed.refresh_token);
          this.sessionRejections = 0;
        } catch (e) {
          if (userStore.sessionRevision !== revision) return 'recovered';
          if (userStore.refreshToken !== lease) return 'recovered';
          if (isSessionRejected(e)) {
            await this.resolveSessionRejection();
            return 'lost';
          }
          // transient — the entitlement refresh below still tries the
          // existing bearer before falling back to the reactive rotation
        }
      }
      return (await this.refreshEntitlement(true)) === 'lost' ? 'lost' : 'recovered';
    },
    async seedFromHandoff(payload: {
      ultimateExpiresAt?: string | null;
      versionLockHorizon?: string | null;
      cancelScheduledAt?: string | null;
    }): Promise<void> {
      const revision = useUserStore().sessionRevision;
      const { ultimateExpiresAt, versionLockHorizon, cancelScheduledAt } = payload;
      if (!ultimateExpiresAt && !versionLockHorizon) {
        return;
      }
      try {
        const seeded = await invoke<EntitlementView>('seed_entitlement', {
          ultimateExpiresAt: ultimateExpiresAt ?? null,
          versionLockHorizon: versionLockHorizon ?? null,
          cancelScheduledAt: cancelScheduledAt ?? null,
        });
        if (useUserStore().sessionRevision === revision) this.view = seeded;
      } catch {
        // best effort — the refresh below still verifies
      }
    },
    // only a real server answer (fetchedAtMs) may surface as a confirmed plan
    async hydrate(): Promise<void> {
      const revision = useUserStore().sessionRevision;
      if (!useUserStore().isLoggedIn) {
        this.view = null;
        return;
      }
      const cached = await invoke<EntitlementView>('get_entitlement', {
        tokenPresent: true,
      }).catch(() => null);
      if (useUserStore().sessionRevision !== revision) return;
      if (cached?.fetchedAtMs != null) {
        this.view = cached;
      }
    },
    async refreshEntitlement(force = false): Promise<'ok' | 'lost'> {
      const userStore = useUserStore();
      const revision = userStore.sessionRevision;
      if (!userStore.isLoggedIn) {
        await this.clearCachedEntitlement();
        return 'ok';
      }
      for (let attempt = 0; ; attempt += 1) {
        if (userStore.sessionRevision !== revision) return 'ok';
        const lease = userStore.refreshToken;
        try {
          const view = await invoke<EntitlementView>('refresh_entitlement', {
            token: userStore.accessToken,
            refreshToken: userStore.refreshToken || null,
            force,
          });
          if (userStore.sessionRevision !== revision) return 'ok';
          if (view.refreshedSession) {
            const rotated = view.refreshedSession;
            userStore.applySessionRefresh(
              rotated.previous_refresh_token,
              rotated.access_token,
              rotated.refresh_token,
            );
          }
          if (view.sessionPhase === 'expired' && userStore.refreshToken !== lease) return 'ok';
          this.view = view;
          if (view.sessionPhase === 'expired') {
            // A dead lease the Rust side could not rotate — never recoverable
            // client-side; resolve the session to the logged-out look.
            await this.handleSessionLoss();
            return 'lost';
          }
          this.sessionRejections = 0;
          return 'ok';
        } catch (e) {
          if (userStore.sessionRevision !== revision) return 'ok';
          if (isSessionRejected(e)) {
            if (userStore.refreshToken !== lease) return 'ok';
            // dead lease — the next login starts clean, and a second
            // consecutive rejection resolves the whole session
            await this.resolveSessionRejection();
            return 'lost';
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
                'signed-in',
              );
            }
            return 'ok';
          }
          await sleep(REFRESH_RETRY_DELAYS_MS[attempt]);
        }
      }
    },
    async clearCachedEntitlement(): Promise<void> {
      this.view = null;
      try {
        await invoke<EntitlementView>('clear_entitlement');
      } catch {
        // best effort — the local view reset below always applies
      }
    },
  },
});
