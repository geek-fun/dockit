import {
  AVATAR_RENEW_MARGIN_SEC,
  resolveAvatarExpiresSec,
  shouldRefreshAvatar,
} from './avatarExpiry';

/**
 * Avatar credential renewal — the avatar counterpart of session rotation.
 *
 * One module-level instance owns every write to the avatar state: proactive
 * checks (app start, login handoff, expiry timer) and the reactive `<img>`
 * error path all funnel through the same single-flight refresh, so four
 * trigger sources can never stampede the console API. The renewal timer is
 * a setTimeout chain — re-armed from the freshly applied expiry after every
 * refresh, cancelled on dispose.
 */

export type AvatarSnapshot = { url: string; expiresAtSec: number };

export type AvatarRefreshPorts = {
  read: () => AvatarSnapshot;
  apply: (url: string, expiresAtSec: number) => void;
  /** Console API call; rejects on transport/auth failure. */
  fetch: () => Promise<{ avatarUrl: string; expiresAtSec: number | null }>;
};

export type AvatarRefreshResult = { ok: boolean; url: string; changed: boolean };

let ports: AvatarRefreshPorts | null = null;
let inFlight: Promise<AvatarRefreshResult> | null = null;
let renewTimer: ReturnType<typeof setTimeout> | null = null;

const nowSec = () => Math.floor(Date.now() / 1000);

export const cancelAvatarRenewal = (): void => {
  if (renewTimer !== null) {
    clearTimeout(renewTimer);
    renewTimer = null;
  }
};

/** Concurrent triggers share one request; the result is the shared outcome. */
export const refreshAvatar = (): Promise<AvatarRefreshResult> => {
  if (!ports) {
    return Promise.resolve({ ok: false, url: '', changed: false });
  }
  if (!inFlight) {
    inFlight = (async () => {
      const previous = ports.read().url;
      try {
        const { avatarUrl, expiresAtSec } = await ports.fetch();
        if (!avatarUrl) {
          return { ok: false, url: previous, changed: false };
        }
        ports.apply(avatarUrl, expiresAtSec ?? 0);
        scheduleAvatarRenewal(expiresAtSec ?? 0);
        return { ok: true, url: avatarUrl, changed: avatarUrl !== previous };
      } catch {
        return { ok: false, url: previous, changed: false };
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
};

/**
 * Proactive calibration: refresh when due, otherwise (re)arm the timer for
 * the margin window. Returns null when the current value is still fresh.
 */
export const ensureFreshAvatar = async (): Promise<AvatarRefreshResult | null> => {
  if (!ports) {
    return null;
  }
  const { url, expiresAtSec } = ports.read();
  if (!shouldRefreshAvatar(url, expiresAtSec)) {
    scheduleAvatarRenewal(resolveAvatarExpiresSec(url, expiresAtSec) ?? 0);
    return null;
  }
  return refreshAvatar();
};

// Hoisted so the arrows above can reference it without a use-before-define
// cycle — refresh re-arms the timer, the timer re-enters the refresh.
function scheduleAvatarRenewal(expiresAtSec: number): void {
  cancelAvatarRenewal();
  if (expiresAtSec <= 0) {
    return;
  }
  const delayMs = Math.min((expiresAtSec - AVATAR_RENEW_MARGIN_SEC - nowSec()) * 1000, 2 ** 31 - 2);
  renewTimer = setTimeout(
    () => {
      renewTimer = null;
      void refreshAvatar();
    },
    Math.max(0, delayMs),
  );
}

export const configureAvatarRefresh = (next: AvatarRefreshPorts | null): void => {
  cancelAvatarRenewal();
  inFlight = null;
  ports = next;
};
