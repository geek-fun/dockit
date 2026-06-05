// Minimum loading time for async operations (in milliseconds)
export const MIN_LOADING_TIME = 1500;

// Auto-close delay for success messages (in milliseconds)
export const SUCCESS_MESSAGE_DELAY = 1000;

// Query history cap bounds and default
export const HISTORY_CAP_MIN = 0;
export const HISTORY_CAP_MAX = 1000;
export const HISTORY_CAP_DEFAULT = 100;

export const CONNECTION_SCHEMA_VERSION = 5;

// Chat runtime defaults
export const CHAT_RUNTIME_DEFAULTS = {
  autoCompact: true,
  maxIterations: 200,
  wallClockBudgetMin: 30,
  tokenBudget: 20_000_000,
} as const;
