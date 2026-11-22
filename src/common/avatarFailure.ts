const AVATAR_IMAGE_RETRY_DELAY_MS = 2000;

export const createAvatarFailureGuard = (retryImage: () => void) => {
  let failedUrl = '';
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };

  return {
    recordFailed: (url: string) => {
      if (!url || url === failedUrl) return false;
      cancelRetry();
      failedUrl = url;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        retryImage();
      }, AVATAR_IMAGE_RETRY_DELAY_MS);
      return true;
    },
    cancelRetry,
    reset: () => {
      cancelRetry();
      failedUrl = '';
    },
  };
};
