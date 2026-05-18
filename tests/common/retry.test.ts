import { retryWithBackoff, isRetryableError } from '../../src/common/retry';

jest.useFakeTimers();

describe('isRetryableError', () => {
  it('returns false for falsy values', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
    expect(isRetryableError(0)).toBe(false);
    expect(isRetryableError('')).toBe(false);
  });

  it('returns true for retryable HTTP status codes', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 504 })).toBe(true);
  });

  it('returns false for non-retryable HTTP status codes', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('returns true for retryable error codes', () => {
    expect(isRetryableError({ code: 'ThrottlingException' })).toBe(true);
    expect(isRetryableError({ code: 'ProvisionedThroughputExceeded' })).toBe(true);
    expect(isRetryableError({ code: 'ServiceUnavailable' })).toBe(true);
    expect(isRetryableError({ code: 'InternalFailure' })).toBe(true);
    expect(isRetryableError({ code: 'InternalServerError' })).toBe(true);
  });

  it('returns false for non-retryable error codes', () => {
    expect(isRetryableError({ code: 'ValidationException' })).toBe(false);
    expect(isRetryableError({ code: 'AccessDeniedException' })).toBe(false);
  });

  it('returns false for error with no status or code', () => {
    expect(isRetryableError({ message: 'some error' })).toBe(false);
    expect(isRetryableError({})).toBe(false);
  });
});

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('resolves immediately when operation succeeds on first attempt', async () => {
    const operation = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(operation, { maxRetries: 3, baseDelay: 0 });
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds after initial failures', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(operation, { maxRetries: 5, baseDelay: 10, jitter: false });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting maxRetries', async () => {
    const err = new Error('persistent failure');
    const operation = jest.fn().mockRejectedValue(err);

    const assertPromise = expect(
      retryWithBackoff(operation, { maxRetries: 2, baseDelay: 10, jitter: false }),
    ).rejects.toThrow('persistent failure');
    await jest.runAllTimersAsync();
    await assertPromise;

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('stops retrying when shouldRetry returns false', async () => {
    const err = new Error('non-retryable');
    const operation = jest.fn().mockRejectedValue(err);
    const shouldRetry = jest.fn().mockReturnValue(false);

    const assertPromise = expect(
      retryWithBackoff(operation, { maxRetries: 5, baseDelay: 10, jitter: false }, shouldRetry),
    ).rejects.toThrow('non-retryable');
    await jest.runAllTimersAsync();
    await assertPromise;

    expect(operation).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(err);
  });

  it('continues retrying when shouldRetry returns true', async () => {
    const err = new Error('retryable');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('done');
    const shouldRetry = jest.fn().mockReturnValue(true);

    const promise = retryWithBackoff(
      operation,
      { maxRetries: 5, baseDelay: 10, jitter: false },
      shouldRetry,
    );
    await jest.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('done');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('respects maxDelay cap', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('err')).mockResolvedValue('ok');

    const promise = retryWithBackoff(operation, {
      maxRetries: 3,
      baseDelay: 10000,
      maxDelay: 100,
      jitter: false,
    });
    await jest.runAllTimersAsync();

    const result = await promise;
    expect(result).toBe('ok');
  });

  it('works without jitter', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('err'))
      .mockResolvedValue('no-jitter');

    const promise = retryWithBackoff(operation, {
      maxRetries: 3,
      baseDelay: 10,
      maxDelay: 5000,
      jitter: false,
    });
    await jest.runAllTimersAsync();

    expect(await promise).toBe('no-jitter');
  });

  it('maxRetries: 0 - throws immediately without retry', async () => {
    const err = new Error('first and only');
    const operation = jest.fn().mockRejectedValue(err);

    const assertPromise = expect(
      retryWithBackoff(operation, { maxRetries: 0, baseDelay: 0 }),
    ).rejects.toThrow('first and only');
    await jest.runAllTimersAsync();
    await assertPromise;

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
