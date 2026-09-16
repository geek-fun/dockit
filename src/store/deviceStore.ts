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
  deviceId: string;
  limit: number;
  used: number;
  /** Device-bound lease issued/renewed by this activation — persisted with
   * the account session. Optional: older backends may omit it. */
  refreshToken?: string | null;
};

/** One activation attempt per app run, plus re-activation after each login. */
const ACTIVATION_THROTTLE_MS = 24 * 60 * 60 * 1000;
const LAST_ACTIVATED_KEY = 'device_last_activated_at';

export const useDeviceStore = defineStore('device', {
  state: (): {
    deviceId: string;
    limit: number;
    used: number;
    limitInfo: DeviceLimitInfo | null;
    showReplaceDialog: boolean;
    activating: boolean;
  } => ({
    deviceId: '',
    limit: 0,
    used: 0,
    limitInfo: null,
    showReplaceDialog: false,
    activating: false,
  }),
  getters: {
    isActivated: state => state.deviceId.length > 0,
    limitReached: state => state.limitInfo !== null,
  },
  actions: {
    shouldAttempt(force: boolean): boolean {
      if (force) {
        return true;
      }
      const last = Number(localStorage.getItem(LAST_ACTIVATED_KEY) ?? 0);
      return !this.isActivated && Date.now() - last > ACTIVATION_THROTTLE_MS;
    },
    /**
     * 权益激活执行点：login 成功与应用启动时调用。失败静默降级为提示——
     * 服务器不会因为设备超限锁账号，5030 弹出替换选择器由用户决定。
     */
    async ensureActivated(force = false): Promise<void> {
      const userStore = useUserStore();
      if (!userStore.isLoggedIn || this.activating || !this.shouldAttempt(force)) {
        return;
      }
      this.activating = true;
      try {
        const result = await invoke<ActivatedResult>('activate_device', {
          token: userStore.accessToken,
          refreshToken: userStore.refreshToken || null,
          replaceDeviceId: null,
        });
        this.applyActivated(result);
        localStorage.setItem(LAST_ACTIVATED_KEY, String(Date.now()));
      } catch (err) {
        const limitInfo = parseLimitReached(err);
        if (limitInfo) {
          this.limitInfo = limitInfo;
          this.showReplaceDialog = true;
        }
      } finally {
        this.activating = false;
      }
    },
    /** Replace the picked device with this machine (geekfun#59 F2). */
    async replaceDevice(deviceId: string): Promise<boolean> {
      const userStore = useUserStore();
      if (!userStore.isLoggedIn || !deviceId || this.activating) {
        return false;
      }
      this.activating = true;
      try {
        const result = await invoke<ActivatedResult>('activate_device', {
          token: userStore.accessToken,
          refreshToken: userStore.refreshToken || null,
          replaceDeviceId: deviceId,
        });
        this.applyActivated(result);
        localStorage.setItem(LAST_ACTIVATED_KEY, String(Date.now()));
        return true;
      } catch (err) {
        const limitInfo = parseLimitReached(err);
        if (limitInfo) {
          // The picked device may have been replaced concurrently — refresh
          // the list so the user can pick again.
          this.limitInfo = limitInfo;
        }
        return false;
      } finally {
        this.activating = false;
      }
    },
    /** Persist an activation outcome: device slots plus the (possibly
     * renewed) device-bound lease, which rides back to the account session. */
    applyActivated(result: ActivatedResult): void {
      const userStore = useUserStore();
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
