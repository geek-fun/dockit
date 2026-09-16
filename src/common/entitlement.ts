export const ENTITLEMENT_ERROR_TYPE = 'ENTITLEMENT_REQUIRED';
export const SESSION_REJECTED_ERROR_TYPE = 'SESSION_REJECTED';

export const UPGRADE_URL = 'https://www.geekfun.club/pricing';

export type PaidFeature =
  | 'ai'
  | 'cluster_manage'
  | 'import_export'
  | 'ssh_tunnel'
  | 'proxy'
  | 'aws_profile'
  | 'mcp_bridge';

export type EntitlementView = {
  ultimateActive: boolean;
  versionLocked: boolean;
  localUltimate: boolean;
  appReleaseDate: string;
  ultimateExpiresAt: string | null;
  versionLockHorizon: string | null;
  cancelScheduledAt: string | null;
  cached: boolean;
  fetchedAtMs: number | null;
  lastError: string | null;
};

/** Rust commands signal structured outcomes via JSON error strings carrying
 * an `error_type` field. */
const errorCarriesType = (error: unknown, type: string): boolean => {
  if (!error) return false;
  if (typeof error === 'object' && 'errorType' in error) {
    return (error as { errorType?: string }).errorType === type;
  }
  const raw = typeof error === 'string' ? error : String(error);
  try {
    const parsed = JSON.parse(raw) as { error_type?: string };
    return parsed.error_type === type;
  } catch {
    return raw.includes(type);
  }
};

export const isEntitlementError = (error: unknown): boolean =>
  errorCarriesType(error, ENTITLEMENT_ERROR_TYPE);

/** The refresh lease was deliberately rejected server-side (expired /
 * revoked / reuse) — the stored lease is dead and must be dropped. */
export const isSessionRejected = (error: unknown): boolean =>
  errorCarriesType(error, SESSION_REJECTED_ERROR_TYPE);
