const TOKEN_EXPIRY_MARGIN_MS = 10 * 60 * 1000;

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const parseJwtExpMs = (token: string): number | null => {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
};

/** String claim lookup (e.g. the stable `id`) for handoff payloads that omit it. */
export const parseJwtStringClaim = (token: string, claim: string): string | null => {
  const value = decodeJwtPayload(token)?.[claim];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

/** Opaque (non-JWT) tokens return false — the reactive 401 path decides. */
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
