import { ref } from 'vue';

/**
 * Composable for form validation display control.
 *
 * Implements the standard UX pattern where validation errors are shown:
 * - After a field loses focus (blur/touch)
 * - After form submission is attempted
 *
 * Usage:
 * ```ts
 * const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();
 * ```
 *
 * In template:
 * ```vue
 * <FormItem :error="getError('fieldName', errors.fieldName)">
 *   <Input @blur="handleBlur('fieldName')" />
 * </FormItem>
 * ```
 */
export function useFormValidation() {
  const touchedFields = ref(new Set<string>());
  const submitted = ref(false);

  /**
   * Mark a field as touched (typically called on blur/focusout).
   */
  const handleBlur = (fieldName: string) => {
    touchedFields.value = new Set([...touchedFields.value, fieldName]);
  };

  /**
   * Returns the error message if the field should display it
   * (field has been touched or form has been submitted), otherwise undefined.
   */
  const getError = (fieldName: string, error?: string): string | undefined => {
    if (!error) return undefined;
    if (submitted.value || touchedFields.value.has(fieldName)) return error;
    return undefined;
  };

  /**
   * Mark the form as submitted, causing all errors to be shown.
   */
  const markSubmitted = () => {
    submitted.value = true;
  };

  /**
   * Reset validation display state (touched fields and submitted flag).
   * Typically called when opening/closing a form dialog.
   */
  const resetValidation = () => {
    touchedFields.value = new Set();
    submitted.value = false;
  };

  return {
    handleBlur,
    getError,
    markSubmitted,
    resetValidation,
  };
}
