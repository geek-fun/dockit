/**
 * Avatar URL expiry (mirror of sessionExpiry.ts for the avatar credential).
 *
 * The console hands off the avatar as an OSS-signed URL — a time-limited
 * credential stored in a metadata slot. The V1 signature embeds its expiry
 * as the `Expires` query parameter (unix seconds), which is the only expiry
 * signal available until the backend returns an explicit `expiresAt`.
 */

/** Renew this far before the signature expires (mirrors the backend cache). */
export const AVATAR_RENEW_MARGIN_SEC = 30 * 60;

export const parseSignedUrlExpiresSec = (url: string): number | null => {
  try {
    const raw = new URL(url).searchParams.get('Expires');
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

/** Store value wins; a legacy handoff without one falls back to URL parsing. */
export const resolveAvatarExpiresSec = (url: string, storedExpiresSec: number): number | null => {
  if (storedExpiresSec > 0) return storedExpiresSec;
  return parseSignedUrlExpiresSec(url);
};

/**
 * Whether the avatar credential is due for renewal. An empty URL with an
 * active session, and an unresolvable expiry, both count as due — the
 * refresh is cheap and the old value cannot be trusted.
 */
export const shouldRefreshAvatar = (
  url: string,
  storedExpiresSec: number,
  nowSec = Math.floor(Date.now() / 1000),
  marginSec = AVATAR_RENEW_MARGIN_SEC,
): boolean => {
  if (!url.trim()) return true;
  const expiresAtSec = resolveAvatarExpiresSec(url, storedExpiresSec);
  if (expiresAtSec === null) return true;
  return expiresAtSec - nowSec <= marginSec;
};
