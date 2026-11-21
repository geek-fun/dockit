import {
  AVATAR_RENEW_MARGIN_SEC,
  parseSignedUrlExpiresSec,
  resolveAvatarExpiresSec,
  shouldRefreshAvatar,
} from '../../src/common/avatarExpiry';

const signedUrl = (expires: number | string | null) =>
  `https://oss.example.com/avatars/u-1.webp?Expires=${expires}&Signature=abc`;

describe('avatarExpiry', () => {
  describe('parseSignedUrlExpiresSec', () => {
    it('extracts the V1 signature Expires parameter as unix seconds', () => {
      expect(parseSignedUrlExpiresSec(signedUrl(1_792_916_106))).toBe(1_792_916_106);
    });

    it('returns null for URLs without a usable Expires parameter', () => {
      expect(parseSignedUrlExpiresSec(signedUrl(null))).toBeNull();
      expect(parseSignedUrlExpiresSec(signedUrl('not-a-number'))).toBeNull();
      expect(parseSignedUrlExpiresSec(signedUrl(0))).toBeNull();
      expect(parseSignedUrlExpiresSec(signedUrl(-5))).toBeNull();
    });

    it('returns null for relative or malformed values — a bare object key is not a credential', () => {
      expect(parseSignedUrlExpiresSec('/avatars/u-1.webp')).toBeNull();
      expect(parseSignedUrlExpiresSec('')).toBeNull();
    });
  });

  describe('resolveAvatarExpiresSec', () => {
    it('prefers the stored value over URL parsing', () => {
      expect(resolveAvatarExpiresSec(signedUrl(100), 200)).toBe(200);
    });

    it('falls back to the URL when the store has no value', () => {
      expect(resolveAvatarExpiresSec(signedUrl(100), 0)).toBe(100);
      expect(resolveAvatarExpiresSec('/avatars/u-1.webp', 0)).toBeNull();
    });
  });

  describe('shouldRefreshAvatar', () => {
    const NOW = 1_800_000_000;

    it('is false while the signature outlives the renewal margin', () => {
      const far = NOW + AVATAR_RENEW_MARGIN_SEC + 60;
      expect(shouldRefreshAvatar(signedUrl(far), 0, NOW)).toBe(false);
    });

    it('is true inside the margin and past expiry', () => {
      const inside = NOW + AVATAR_RENEW_MARGIN_SEC - 60;
      expect(shouldRefreshAvatar(signedUrl(inside), 0, NOW)).toBe(true);
      expect(shouldRefreshAvatar(signedUrl(NOW - 1), 0, NOW)).toBe(true);
    });

    it('treats an empty URL with a session as due', () => {
      expect(shouldRefreshAvatar('', 0, NOW)).toBe(true);
      expect(shouldRefreshAvatar('   ', 0, NOW)).toBe(true);
    });

    it('treats an unresolvable expiry as due', () => {
      expect(shouldRefreshAvatar('/avatars/u-1.webp', 0, NOW)).toBe(true);
    });
  });
});
