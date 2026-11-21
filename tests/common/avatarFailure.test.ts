import { createAvatarFailureGuard } from '../../src/common/avatarFailure';

describe('avatarFailure', () => {
  it('allows one re-sign attempt per failed URL', () => {
    const guard = createAvatarFailureGuard();
    expect(guard.recordFailed('https://oss/a.webp')).toBe(true);
    expect(guard.recordFailed('https://oss/a.webp')).toBe(false);
  });

  it('treats a different URL as a new failure', () => {
    const guard = createAvatarFailureGuard();
    guard.recordFailed('https://oss/a.webp');
    expect(guard.recordFailed('https://oss/b.webp?Expires=2')).toBe(true);
  });

  it('never records an empty URL', () => {
    const guard = createAvatarFailureGuard();
    expect(guard.recordFailed('')).toBe(false);
  });

  it('reports recovery only once the avatar moves past the failed URL', () => {
    const guard = createAvatarFailureGuard();
    guard.recordFailed('https://oss/a.webp');
    expect(guard.hasRecovered('https://oss/a.webp')).toBe(false);
    expect(guard.hasRecovered('https://oss/b.webp')).toBe(true);
    expect(guard.hasRecovered('')).toBe(true);
  });
});
