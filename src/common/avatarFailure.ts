/**
 * One re-sign attempt per failed avatar URL; the marker is deliberately
 * ephemeral so a network hiccup is retried on the next session.
 */
type AvatarFailureGuard = {
  recordFailed: (url: string) => boolean;
  hasRecovered: (url: string) => boolean;
};

export const createAvatarFailureGuard = (): AvatarFailureGuard => {
  let failedUrl = '';
  return {
    recordFailed: url => {
      if (!url || url === failedUrl) return false;
      failedUrl = url;
      return true;
    },
    hasRecovered: url => url !== failedUrl,
  };
};
