/**
 * Avatar URL expiry — the OSS V1 signature's `Expires` query parameter
 * (unix seconds) is the authoritative signal; a stored `expiresAt` only
 * fills in for URLs without a signature.
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

/** Unix seconds above this are milliseconds or junk (~year 5138). */
const MAX_PLAUSIBLE_EXPIRES_SEC = 10 ** 11;

/** The signature's own `Expires` is what the storage enforces; a stored value
 * only fills in for unsigned URLs and is rejected when implausible. */
export const resolveAvatarExpiresSec = (url: string, storedExpiresSec: number): number | null => {
  const signedExpiresSec = parseSignedUrlExpiresSec(url);
  if (signedExpiresSec !== null) return signedExpiresSec;
  return storedExpiresSec > 0 && storedExpiresSec < MAX_PLAUSIBLE_EXPIRES_SEC
    ? storedExpiresSec
    : null;
};

/** An empty URL with an active session, and an unresolvable expiry, both
 * count as due — the refresh is cheap and the old value cannot be trusted. */
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
