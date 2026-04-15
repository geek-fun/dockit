const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type RetryOptions = {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  jitter: boolean;
};

const defaultRetryOptions: RetryOptions = {
  maxRetries: 5,
  baseDelay: 100,
  maxDelay: 5000,
  jitter: true,
};

export const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  shouldRetry?: (error: unknown) => boolean,
): Promise<T> => {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        throw error;
      }

      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      const exponentialDelay = opts.baseDelay * Math.pow(2, attempt);
      const delayWithJitter = opts.jitter
        ? exponentialDelay + Math.random() * opts.baseDelay
        : exponentialDelay;
      const delay = Math.min(delayWithJitter, opts.maxDelay);

      await sleep(delay);
    }
  }

  throw lastError;
};

export const isRetryableError = (error: unknown): boolean => {
  if (!error) return false;

  const errorObj = error as { status?: number; code?: string };

  const retryableStatusCodes = [429, 500, 502, 503, 504];
  if (errorObj.status && retryableStatusCodes.includes(errorObj.status)) {
    return true;
  }

  const retryableCodes = [
    'ThrottlingException',
    'ProvisionedThroughputExceeded',
    'ServiceUnavailable',
    'InternalFailure',
    'InternalServerError',
  ];
  if (errorObj.code && retryableCodes.includes(errorObj.code)) {
    return true;
  }

  return false;
};
