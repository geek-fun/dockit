import { isSafeAvatarUrl } from '../../src/datasources/authService';

describe('isSafeAvatarUrl', () => {
  it('allows https URLs on the console and media allowlist', () => {
    expect(isSafeAvatarUrl('https://console.geekfun.club/avatar/a.webp')).toBe(true);
    expect(isSafeAvatarUrl('https://console-geekfun.wentsen.com/a.webp')).toBe(true);
    expect(
      isSafeAvatarUrl(
        'https://wentsen-media-store-prod.oss-ap-southeast-1.aliyuncs.com/a.webp?Expires=1',
      ),
    ).toBe(true);
    expect(isSafeAvatarUrl('https://lh3.googleusercontent.com/a.png')).toBe(true);
  });

  it('rejects plain http even for allowlisted hosts', () => {
    expect(isSafeAvatarUrl('http://console.geekfun.club/a.webp')).toBe(false);
  });

  it('requires an exact hostname match', () => {
    expect(isSafeAvatarUrl('https://evil.console.geekfun.club/a.webp')).toBe(false);
    expect(isSafeAvatarUrl('https://console.geekfun.club.evil.com/a.webp')).toBe(false);
  });

  it('rejects relative, empty and non-http payloads', () => {
    expect(isSafeAvatarUrl('/avatars/u-1.webp')).toBe(false);
    expect(isSafeAvatarUrl('')).toBe(false);
    expect(isSafeAvatarUrl('javascript:alert(1)')).toBe(false);
  });

  it('allows the local console only when dev hosts are enabled', () => {
    expect(isSafeAvatarUrl('http://localhost:5174/a.webp')).toBe(false);
    expect(isSafeAvatarUrl('http://localhost:5174/a.webp', true)).toBe(true);
    expect(isSafeAvatarUrl('http://evil.example.com/a.webp', true)).toBe(false);
  });
});
