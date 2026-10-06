/** Bearer-token expiry helpers for proactive session renewal.
 * Pure functions — no Tauri, no store access, unit-testable. */

export const TOKEN_EXPIRY_MARGIN_MS = 10 * 60 * 1000;

/** Decode a JWT payload and return its `exp` claim as unix milliseconds.
 * Returns null for malformed or non-numeric claims — never throws. */
export const parseJwtExpMs = (token: string): number | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    const payload = JSON.parse(json) as { exp?: unknown };
    const exp = payload.exp;
    return typeof exp === 'number' && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
};

/** True when the lease should be rotated before the token is next used:
 * a stored lease exists AND the access token is missing or expires within
 * `marginMs`. Opaque (non-JWT) tokens return false — the reactive 401 path
 * decides for them. */
export const shouldRotateToken = (
  token: string,
  refreshToken: string,
  now = Date.now(),
  marginMs = TOKEN_EXPIRY_MARGIN_MS,
): boolean => {
  if (!refreshToken.trim()) return false;
  if (!token.trim()) return true;
  const expMs = parseJwtExpMs(token);
  if (expMs === null) return false;
  return expMs - now <= marginMs;
};
