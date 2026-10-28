import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { useUserStore } from './userStore';

export const DEVICE_LIMIT_ERROR_TYPE = 'DEVICE_LIMIT_REACHED';

export type DeviceDto = {
  id: string;
  name: string;
  platform: string;
  activatedAt?: string | null;
  lastSeenAt?: string | null;
  isCurrent?: boolean;
  status: string;
};

export type DeviceLimitInfo = {
  limit: number;
  used: number;
  devices: Array<DeviceDto>;
  manageUrl?: string | null;
};

export type ActivatedResult = {
  accessToken?: string | null;
  deviceId: string;
  limit: number;
  used: number;
  /** Device-bound lease issued/renewed by this activation — persisted with
   * the account session. Optional: older backends may omit it. */
  refreshToken?: string | null;
};

const ACTIVATION_THROTTLE_MS = 24 * 60 * 60 * 1000;
const ACTIVATION_RETRY_DELAYS_MS = [1500, 3000, 6000];
const LAST_ACTIVATED_KEY = 'device_last_activated_at';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isActivationFatal = (err: unknown): boolean => {
  const raw = typeof err === 'string' ? err : String(err);
  return raw.includes('session expired') || raw.includes('not logged in');
};

export const useDeviceStore = defineStore('device', {
  state: (): {
    deviceId: string;
    limit: number;
    used: number;
    limitInfo: DeviceLimitInfo | null;
    showReplaceDialog: boolean;
    activationRevision: number;
    activating: boolean;
    /** Last activation failure — shown in the plan section (plan-section.vue). */
    activationError: string | null;
  } => ({
    deviceId: '',
    limit: 0,
    used: 0,
    limitInfo: null,
    showReplaceDialog: false,
    activationRevision: -1,
    activating: false,
    activationError: null,
  }),
  getters: {
    isActivated: state => state.deviceId.length > 0,
    limitReached: state => state.limitInfo !== null,
  },
  actions: {
    shouldAttempt(force: boolean): boolean {
      if (force || !useUserStore().refreshToken) {
        return true;
      }
      const last = Number(localStorage.getItem(LAST_ACTIVATED_KEY) ?? 0);
      return !this.isActivated && Date.now() - last > ACTIVATION_THROTTLE_MS;
    },
    // Activation issues the renewal lease — final failure means the session
    // cannot self-heal; 5030 needs the user's replace decision instead.
    async ensureActivated(force = false): Promise<void> {
      const userStore = useUserStore();
      const revision = userStore.sessionRevision;
      if (
        !userStore.isLoggedIn ||
        (this.activating && this.activationRevision === revision) ||
        !this.shouldAttempt(force)
      ) {
        return;
      }
      this.activationRevision = revision;
      this.activating = true;
      try {
        for (let attempt = 0; ; attempt += 1) {
          if (userStore.sessionRevision !== revision) return;
          try {
            const result = await invoke<ActivatedResult>('activate_device', {
              token: userStore.accessToken,
              refreshToken: userStore.refreshToken || null,
              replaceDeviceId: null,
            });
            if (userStore.sessionRevision !== revision) return;
            this.applyActivated(result);
            this.activationError = null;
            if (userStore.refreshToken)
              localStorage.setItem(LAST_ACTIVATED_KEY, String(Date.now()));
            return;
          } catch (err) {
            if (userStore.sessionRevision !== revision) return;
            const limitInfo = parseLimitReached(err);
            if (limitInfo) {
              this.limitInfo = limitInfo;
              this.showReplaceDialog = true;
              return;
            }
            if (attempt >= ACTIVATION_RETRY_DELAYS_MS.length || isActivationFatal(err)) {
              this.activationError = typeof err === 'string' ? err : String(err);
              return;
            }
            await sleep(ACTIVATION_RETRY_DELAYS_MS[attempt]);
          }
        }
      } finally {
        if (this.activationRevision === revision) this.activating = false;
      }
    },
    /** Replace the picked device with this machine (geekfun#59 F2). */
    async replaceDevice(deviceId: string): Promise<boolean> {
      const userStore = useUserStore();
      const revision = userStore.sessionRevision;
      if (
        !userStore.isLoggedIn ||
        !deviceId ||
        (this.activating && this.activationRevision === revision)
      ) {
        return false;
      }
      this.activationRevision = revision;
      this.activating = true;
      try {
        const result = await invoke<ActivatedResult>('activate_device', {
          token: userStore.accessToken,
          refreshToken: userStore.refreshToken || null,
          replaceDeviceId: deviceId,
        });
        if (userStore.sessionRevision !== revision) return false;
        this.applyActivated(result);
        this.activationError = null;
        localStorage.setItem(LAST_ACTIVATED_KEY, String(Date.now()));
        return true;
      } catch (err) {
        if (userStore.sessionRevision !== revision) return false;
        const limitInfo = parseLimitReached(err);
        if (limitInfo) {
          // The picked device may have been replaced concurrently — refresh
          // the list so the user can pick again.
          this.limitInfo = limitInfo;
        }
        return false;
      } finally {
        if (this.activationRevision === revision) this.activating = false;
      }
    },
    /** Persist an activation outcome: device slots plus the (possibly
     * renewed) device-bound lease, which rides back to the account session. */
    applyActivated(result: ActivatedResult): void {
      const userStore = useUserStore();
      if (result.accessToken) userStore.setToken(result.accessToken);
      this.deviceId = result.deviceId;
      this.limit = result.limit;
      this.used = result.used;
      this.limitInfo = null;
      this.showReplaceDialog = false;
      if (result.refreshToken) {
        userStore.setRefreshToken(result.refreshToken);
      }
    },
    dismissReplaceDialog(): void {
      this.showReplaceDialog = false;
    },
  },
});

const parseLimitReached = (err: unknown): DeviceLimitInfo | null => {
  try {
    const raw = typeof err === 'string' ? err : JSON.stringify(err);
    const parsed = JSON.parse(raw) as {
      error_type?: string;
      limit_reached?: DeviceLimitInfo;
    };
    if (parsed?.error_type === DEVICE_LIMIT_ERROR_TYPE && parsed.limit_reached) {
      return parsed.limit_reached;
    }
  } catch {
    // plain network / HTTP errors carry no limit payload
  }
  return null;
};
