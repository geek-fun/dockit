import {
  isEntitlementError,
  isSessionRejected,
  ENTITLEMENT_ERROR_TYPE,
  SESSION_REJECTED_ERROR_TYPE,
  type EntitlementView,
} from '../../src/common/entitlement';

const view = (overrides: Partial<EntitlementView> = {}): EntitlementView => ({
  ultimateActive: false,
  versionLocked: false,
  localUltimate: false,
  appReleaseDate: '2026-09-11',
  ultimateExpiresAt: null,
  versionLockHorizon: null,
  cancelScheduledAt: null,
  cached: false,
  fetchedAtMs: null,
  lastError: null,
  ...overrides,
});

describe('isEntitlementError', () => {
  it('detects the structured Rust error payload', () => {
    const raw = JSON.stringify({
      status: 403,
      error_type: ENTITLEMENT_ERROR_TYPE,
      message: "'AI' requires an Ultimate subscription",
    });
    expect(isEntitlementError(raw)).toBe(true);
  });

  it('detects CustomError-like objects carrying the error type', () => {
    expect(isEntitlementError({ errorType: ENTITLEMENT_ERROR_TYPE })).toBe(true);
  });

  it('detects plain errors mentioning the type', () => {
    expect(isEntitlementError(new Error(ENTITLEMENT_ERROR_TYPE))).toBe(true);
  });

  it('rejects unrelated errors', () => {
    expect(isEntitlementError('DNS_ERROR: cannot resolve')).toBe(false);
    expect(isEntitlementError(null)).toBe(false);
    expect(isEntitlementError(undefined)).toBe(false);
  });
});

describe('isSessionRejected', () => {
  it('detects the structured Rust rejection payload', () => {
    const raw = JSON.stringify({
      error_type: SESSION_REJECTED_ERROR_TYPE,
      message: 'session refresh rejected',
    });
    expect(isSessionRejected(raw)).toBe(true);
    expect(isEntitlementError(raw)).toBe(false);
  });

  it('rejects unrelated errors', () => {
    expect(isSessionRejected('network error: timeout')).toBe(false);
    expect(isSessionRejected(undefined)).toBe(false);
  });
});

describe('entitlement view defaults', () => {
  it('community mode has no entitlements', () => {
    const community = view();
    expect(community.localUltimate).toBe(false);
    expect(community.ultimateActive).toBe(false);
    expect(community.versionLocked).toBe(false);
  });

  it('version lock keeps local features without an active subscription', () => {
    const locked = view({ versionLocked: true, localUltimate: true });
    expect(locked.localUltimate).toBe(true);
    expect(locked.ultimateActive).toBe(false);
  });
});
