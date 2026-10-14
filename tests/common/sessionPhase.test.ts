import { deriveSessionPhase, sessionPhaseFromTokens } from '../../src/common/sessionPhase';
import { parseJwtExpMs } from '../../src/common/sessionExpiry';

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const jwtWithExp = (exp: number) => `${b64url({ alg: 'HS256' })}.${b64url({ exp })}.sig`;

const NOW = 1_800_000_000_000;
const expSecs = (offsetMs: number) => (NOW + offsetMs) / 1000;
const validToken = jwtWithExp(expSecs(30 * 1000));
const expiredToken = jwtWithExp(expSecs(-60 * 1000));

describe('deriveSessionPhase', () => {
  it('anonymous wins when no access token exists', () => {
    expect(
      deriveSessionPhase({
        hasAccessToken: false,
        hasLease: false,
        serverPhase: 'signed-in',
        accessTokenExpMs: null,
        now: NOW,
      }),
    ).toBe('anonymous');
  });

  it('a server-side expired verdict demotes the phase', () => {
    expect(
      deriveSessionPhase({
        hasAccessToken: true,
        hasLease: true,
        serverPhase: 'expired',
        accessTokenExpMs: NOW + 10_000,
        now: NOW,
      }),
    ).toBe('expired');
  });

  it('an expired token stays signed-in while a lease can renew it', () => {
    expect(
      deriveSessionPhase({
        hasAccessToken: true,
        hasLease: true,
        serverPhase: 'signed-in',
        accessTokenExpMs: NOW - 60_000,
        now: NOW,
      }),
    ).toBe('signed-in');
  });

  it('an expired token without a lease is expired — no way to recover', () => {
    expect(
      deriveSessionPhase({
        hasAccessToken: true,
        hasLease: false,
        serverPhase: 'signed-in',
        accessTokenExpMs: NOW - 60_000,
        now: NOW,
      }),
    ).toBe('expired');
  });

  it('a healthy token with no server verdict is signed-in', () => {
    expect(
      deriveSessionPhase({
        hasAccessToken: true,
        hasLease: false,
        serverPhase: null,
        accessTokenExpMs: NOW + 10_000,
        now: NOW,
      }),
    ).toBe('signed-in');
  });
});

describe('sessionPhaseFromTokens', () => {
  it('composes token facts and the server verdict from raw strings', () => {
    expect(sessionPhaseFromTokens(validToken, 'lease', null, NOW)).toBe('signed-in');
    expect(sessionPhaseFromTokens(validToken, '', 'expired', NOW)).toBe('expired');
    expect(sessionPhaseFromTokens(expiredToken, 'lease', 'signed-in', NOW)).toBe('signed-in');
    expect(sessionPhaseFromTokens(expiredToken, '', null, NOW)).toBe('expired');
  });

  it('treats blank tokens as anonymous', () => {
    expect(sessionPhaseFromTokens('', 'lease', null, NOW)).toBe('anonymous');
  });

  it('exposes the real JWT exp through parseJwtExpMs', () => {
    expect(parseJwtExpMs(validToken)).toBe(NOW + 30_000);
  });
});
