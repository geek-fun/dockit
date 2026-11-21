import {
  AVATAR_RENEW_MARGIN_SEC,
  resolveAvatarExpiresSec,
  shouldRefreshAvatar,
} from './avatarExpiry';

/**
 * Avatar credential renewal — the avatar counterpart of session rotation.
 * One single-flight refresh serves every trigger (startup, handoff, renewal
 * timer, `<img>` error); the timer is a setTimeout chain re-armed from the
 * freshly applied expiry, cancelled on dispose.
 */

/** Never renew sooner than this, even when the margin target is already past. */
export const AVATAR_RENEW_MIN_DELAY_SEC = 5 * 60;

/** Consecutive attempts before a failing renewal waits for an external trigger. */
export const AVATAR_REFRESH_RETRY_LIMIT = 3;

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
let failedAttempts = 0;

const nowSec = () => Math.floor(Date.now() / 1000);

export const cancelAvatarRenewal = (): void => {
  if (renewTimer !== null) {
    clearTimeout(renewTimer);
    renewTimer = null;
  }
};

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
        // Resolve the applied URL's own Expires so the timer arms for the
        // value just applied, not only at the next startup.
        const expiry = resolveAvatarExpiresSec(avatarUrl, expiresAtSec ?? 0) ?? 0;
        failedAttempts = 0;
        ports.apply(avatarUrl, expiry);
        scheduleAvatarRenewal(expiry);
        return { ok: true, url: avatarUrl, changed: avatarUrl !== previous };
      } catch {
        scheduleAvatarRetry();
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

// Hoisted: refresh re-arms the timer and the timer re-enters the refresh —
// an arrow above this point would be a use-before-define cycle.
function scheduleAvatarRenewal(expiresAtSec: number): void {
  cancelAvatarRenewal();
  if (expiresAtSec <= 0) {
    return;
  }
  // Without a floor, a signature already inside the margin would re-fire
  // the renewal immediately and spin.
  const targetDelaySec = expiresAtSec - AVATAR_RENEW_MARGIN_SEC - nowSec();
  const delayMs = Math.min(
    Math.max(targetDelaySec, AVATAR_RENEW_MIN_DELAY_SEC) * 1000,
    2 ** 31 - 2,
  );
  renewTimer = setTimeout(() => {
    renewTimer = null;
    void refreshAvatar();
  }, delayMs);
}

/** Retry a failing renewal after the floor delay, capped — an offline
 * machine must not poll forever. */
function scheduleAvatarRetry(): void {
  failedAttempts += 1;
  if (failedAttempts >= AVATAR_REFRESH_RETRY_LIMIT) return;
  if (!ports || !ports.read().url) return;
  cancelAvatarRenewal();
  renewTimer = setTimeout(() => {
    renewTimer = null;
    void refreshAvatar();
  }, AVATAR_RENEW_MIN_DELAY_SEC * 1000);
}

export const configureAvatarRefresh = (next: AvatarRefreshPorts | null): void => {
  cancelAvatarRenewal();
  inFlight = null;
  failedAttempts = 0;
  ports = next;
};
