import { parseJwtExpMs } from './sessionExpiry';

/** Session health phases — the single source of truth the account UI derives
 * every login/logout CTA and the plan display from.
 * - `signed-in`: the token/lease pair is believed to still serve.
 * - `expired`: re-login required — the server refused the lease, or the
 *   access token cannot serve and no lease exists to renew it.
 * - `anonymous`: no access token at all. */
export type SessionPhase = 'signed-in' | 'expired' | 'anonymous';

export type SessionPhaseInput = {
  hasAccessToken: boolean;
  hasLease: boolean;
  /** Structured verdict from the last entitlement refresh (`sessionPhase`
   * on the view); only an `expired` verdict can demote the phase. */
  serverPhase: string | null | undefined;
  accessTokenExpMs: number | null;
  now?: number;
};

export const deriveSessionPhase = ({
  hasAccessToken,
  hasLease,
  serverPhase,
  accessTokenExpMs,
  now = Date.now(),
}: SessionPhaseInput): SessionPhase => {
  if (!hasAccessToken) return 'anonymous';
  if (serverPhase === 'expired') return 'expired';
  if (accessTokenExpMs !== null && accessTokenExpMs <= now && !hasLease) return 'expired';
  return 'signed-in';
};

export const sessionPhaseFromTokens = (
  accessToken: string,
  lease: string,
  serverPhase: string | null | undefined,
  now?: number,
): SessionPhase =>
  deriveSessionPhase({
    hasAccessToken: accessToken.trim() !== '',
    hasLease: lease.trim() !== '',
    serverPhase,
    accessTokenExpMs: accessToken.trim() === '' ? null : parseJwtExpMs(accessToken),
    now,
  });
