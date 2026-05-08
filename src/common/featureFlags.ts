declare const __MONGODB_ENABLED__: boolean;

const getMongodbEnabled = (): boolean => {
  try {
    return typeof __MONGODB_ENABLED__ !== 'undefined' ? __MONGODB_ENABLED__ : false;
  } catch {
    return false;
  }
};

export const isFeatureEnabled = {
  mongodb: getMongodbEnabled(),
};
