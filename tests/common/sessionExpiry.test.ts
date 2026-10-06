import { parseJwtExpMs, shouldRotateToken } from '../../src/common/sessionExpiry';

const b64url = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const jwtWithExp = (exp: number) => `${b64url({ alg: 'HS256' })}.${b64url({ exp })}.sig`;

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

describe('sessionExpiry', () => {
  describe('parseJwtExpMs', () => {
    it('decodes a numeric exp claim as unix milliseconds', () => {
      expect(parseJwtExpMs(jwtWithExp(1_800_003_600))).toBe(1_800_003_600_000);
    });

    it('returns null for malformed or claim-less tokens', () => {
      expect(parseJwtExpMs('not-a-jwt')).toBeNull();
      expect(parseJwtExpMs('a.b')).toBeNull();
      expect(parseJwtExpMs(`${b64url({ alg: 'HS256' })}.${btoa('{"exp":"soon"}')}.sig`)).toBeNull();
      expect(parseJwtExpMs(`${b64url({ alg: 'HS256' })}.%%%bad%%%.sig`)).toBeNull();
    });
  });

  describe('shouldRotateToken', () => {
    it('rotates when the token expires within the margin', () => {
      const exp = (NOW + 5 * 60 * 1000) / 1000;
      expect(shouldRotateToken(jwtWithExp(exp), 'lease', NOW)).toBe(true);
    });

    it('keeps a token with comfortable validity', () => {
      const exp = (NOW + 30 * 60 * 1000) / 1000;
      expect(shouldRotateToken(jwtWithExp(exp), 'lease', NOW)).toBe(false);
    });

    it('rotates an expired token and a missing token when a lease exists', () => {
      const exp = (NOW - HOUR) / 1000;
      expect(shouldRotateToken(jwtWithExp(exp), 'lease', NOW)).toBe(true);
      expect(shouldRotateToken('', 'lease', NOW)).toBe(true);
    });

    it('never rotates without a lease', () => {
      const exp = (NOW - HOUR) / 1000;
      expect(shouldRotateToken(jwtWithExp(exp), '', NOW)).toBe(false);
      expect(shouldRotateToken('', '', NOW)).toBe(false);
    });

    it('leaves opaque tokens to the reactive 401 path', () => {
      expect(shouldRotateToken('opaque-token-value', 'lease', NOW)).toBe(false);
    });
  });
});
