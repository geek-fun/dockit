const DEFAULT_LOADING_DELAY_MS = 500;

const withLoadingDelay = async <T>(
  promise: Promise<T>,
  delayMs: number = DEFAULT_LOADING_DELAY_MS,
): Promise<T> => {
  const start = Date.now();
  const result = await promise;
  const elapsed = Date.now() - start;

  if (elapsed < delayMs) {
    await new Promise(resolve => setTimeout(resolve, delayMs - elapsed));
  }

  return result;
};

export { withLoadingDelay, DEFAULT_LOADING_DELAY_MS };
