import { createAvatarFailureGuard } from '../../src/common/avatarFailure';

describe('avatarFailure', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('allows one re-sign attempt and one delayed reload of the same URL', () => {
    const retry = jest.fn();
    const guard = createAvatarFailureGuard(retry);
    expect(guard.recordFailed('https://oss/a.webp')).toBe(true);
    expect(guard.recordFailed('https://oss/a.webp')).toBe(false);
    expect(retry).not.toHaveBeenCalled();
    jest.runOnlyPendingTimers();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(guard.recordFailed('https://oss/a.webp')).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('treats a different URL as a new failure', () => {
    const guard = createAvatarFailureGuard(jest.fn());
    guard.recordFailed('https://oss/a.webp');
    expect(guard.recordFailed('https://oss/b.webp?Expires=2')).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('never records an empty URL', () => {
    const guard = createAvatarFailureGuard(jest.fn());
    expect(guard.recordFailed('')).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a pending reload when the avatar changes or the view unmounts', () => {
    const retry = jest.fn();
    const guard = createAvatarFailureGuard(retry);
    guard.recordFailed('https://oss/a.webp');
    guard.cancelRetry();
    jest.runOnlyPendingTimers();
    expect(retry).not.toHaveBeenCalled();
  });

  it('clears the retry limit for a new login with the same URL', () => {
    const guard = createAvatarFailureGuard(jest.fn());
    guard.recordFailed('https://oss/a.webp');
    guard.reset();
    expect(jest.getTimerCount()).toBe(0);
    expect(guard.recordFailed('https://oss/a.webp')).toBe(true);
  });
});
