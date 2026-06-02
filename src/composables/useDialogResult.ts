import { ref, computed, type ComputedRef, type Ref } from 'vue';

export type DialogState = 'idle' | 'success' | 'error';

export type UseDialogResult = {
  state: Ref<DialogState>;
  message: Ref<string>;
  isIdle: ComputedRef<boolean>;
  isSuccess: ComputedRef<boolean>;
  isError: ComputedRef<boolean>;
  succeed: (msg?: string) => void;
  fail: (msg: string) => void;
  reset: () => void;
};

/**
 * Unified dialog result state management.
 *
 * Eliminates the inconsistent `resultMessage`/`resultType`/`successMessage`/
 * `errorMessage` patterns found across 15 dialog components.
 *
 * Usage:
 * ```typescript
 * const { state, message, isIdle, isSuccess, isError, succeed, fail, reset } = useDialogResult();
 * succeed();                     // state='success'
 * fail('status: 400, details: ...');
 * reset();                       // returns to idle
 * ```
 */
export const useDialogResult = (): UseDialogResult => {
  const state = ref<DialogState>('idle');
  const message = ref('');

  const isIdle = computed(() => state.value === 'idle');
  const isSuccess = computed(() => state.value === 'success');
  const isError = computed(() => state.value === 'error');

  const succeed = (msg?: string) => {
    state.value = 'success';
    message.value = msg ?? '';
  };

  const fail = (msg: string) => {
    state.value = 'error';
    message.value = msg;
  };

  const reset = () => {
    state.value = 'idle';
    message.value = '';
  };

  return { state, message, isIdle, isSuccess, isError, succeed, fail, reset };
};

/**
 * Format an API error into a human-readable string.
 * Standardises the `status: X, details: Y` pattern.
 */
export const formatApiError = (err: unknown): string => {
  const e = err as Record<string, unknown>;
  if (err && typeof err === 'object' && 'status' in e && 'details' in e) {
    return `status: ${e.status ?? 'unknown'}, details: ${e.details ?? e.message ?? String(err)}`;
  }
  return err instanceof Error ? err.message : String(err);
};
