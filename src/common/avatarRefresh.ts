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

type AvatarSnapshot = { url: string; expiresAtSec: number };

export type AvatarRefreshPorts = {
  read: () => AvatarSnapshot | null;
  apply: (url: string, expiresAtSec: number) => void;
  /** Console API call; rejects on transport/auth failure. */
  fetch: () => Promise<{ avatarUrl: string; expiresAtSec: number | null }>;
};

type AvatarRefreshResult = { ok: boolean; url: string; changed: boolean };
type AvatarRefreshSession = {
  ports: AvatarRefreshPorts;
  inFlight: Promise<AvatarRefreshResult> | null;
  renewTimer: ReturnType<typeof setTimeout> | null;
  failedAttempts: number;
};

let session: AvatarRefreshSession | null = null;
const nowSec = () => Math.floor(Date.now() / 1000);
const failedRefresh = (url = ''): AvatarRefreshResult => ({ ok: false, url, changed: false });

const cancelAvatarRenewal = (current: AvatarRefreshSession): void => {
  if (current.renewTimer !== null) {
    clearTimeout(current.renewTimer);
    current.renewTimer = null;
  }
};

const fetchAvatar = async (
  current: AvatarRefreshSession,
  previous: string,
): Promise<AvatarRefreshResult> => {
  try {
    const { avatarUrl, expiresAtSec } = await current.ports.fetch();
    if (session !== current) return failedRefresh();
    if (!avatarUrl) return failedRefresh(previous);
    const expiry = resolveAvatarExpiresSec(avatarUrl, expiresAtSec ?? 0) ?? 0;
    current.failedAttempts = 0;
    current.ports.apply(avatarUrl, expiry);
    scheduleAvatarRenewal(current, expiry);
    return { ok: true, url: avatarUrl, changed: avatarUrl !== previous };
  } catch {
    if (session !== current) return failedRefresh();
    scheduleAvatarRetry(current);
    return failedRefresh(previous);
  }
};

export const refreshAvatar = (): Promise<AvatarRefreshResult> => {
  const current = session;
  const snapshot = current?.ports.read();
  if (!current || !snapshot) return Promise.resolve(failedRefresh());

  current.inFlight ??= fetchAvatar(current, snapshot.url).finally(() => {
    current.inFlight = null;
  });
  return current.inFlight;
};

/**
 * Proactive calibration: refresh when due, otherwise (re)arm the timer for
 * the margin window. Returns null when the current value is still fresh.
 */
export const ensureFreshAvatar = async (): Promise<AvatarRefreshResult | null> => {
  const current = session;
  const snapshot = current?.ports.read();
  if (!current || !snapshot) return null;

  const { url, expiresAtSec } = snapshot;
  if (!shouldRefreshAvatar(url, expiresAtSec)) {
    scheduleAvatarRenewal(current, resolveAvatarExpiresSec(url, expiresAtSec) ?? 0);
    return null;
  }
  return refreshAvatar();
};

function scheduleAvatarRenewal(current: AvatarRefreshSession, expiresAtSec: number): void {
  if (expiresAtSec <= 0) {
    cancelAvatarRenewal(current);
    return;
  }
  // Without a floor, a signature already inside the margin would re-fire
  // the renewal immediately and spin.
  const targetDelaySec = expiresAtSec - AVATAR_RENEW_MARGIN_SEC - nowSec();
  const delayMs = Math.min(
    Math.max(targetDelaySec, AVATAR_RENEW_MIN_DELAY_SEC) * 1000,
    2 ** 31 - 2,
  );
  scheduleAvatarRefresh(current, delayMs);
}

/** Retry a failing renewal after the floor delay, capped — an offline
 * machine must not poll forever. */
function scheduleAvatarRetry(current: AvatarRefreshSession): void {
  current.failedAttempts += 1;
  if (current.failedAttempts >= AVATAR_REFRESH_RETRY_LIMIT || !current.ports.read()?.url) return;
  scheduleAvatarRefresh(current, AVATAR_RENEW_MIN_DELAY_SEC * 1000);
}

function scheduleAvatarRefresh(current: AvatarRefreshSession, delayMs: number): void {
  cancelAvatarRenewal(current);
  current.renewTimer = setTimeout(() => {
    current.renewTimer = null;
    if (session === current) void refreshAvatar();
  }, delayMs);
}

export const configureAvatarRefresh = (ports: AvatarRefreshPorts | null): void => {
  if (session) cancelAvatarRenewal(session);
  session = ports ? { ports, inFlight: null, renewTimer: null, failedAttempts: 0 } : null;
};
