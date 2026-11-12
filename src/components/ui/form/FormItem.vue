<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FormItemProps {
  label?: string;
  required?: boolean;
  class?: string;
  labelWidth?: string | number;
  error?: string;
  controlId?: string;
  labelClass?: string;
}

const props = withDefaults(defineProps<FormItemProps>(), {
  required: false,
  label: undefined,
  class: undefined,
  labelWidth: undefined,
  error: undefined,
  controlId: undefined,
  labelClass: undefined,
});
const errorId = computed(() => (props.controlId ? `${props.controlId}-error` : undefined));
const control = computed(() => ({
  id: props.controlId,
  'aria-required': props.required || undefined,
  'aria-invalid': !!props.error || undefined,
  'aria-describedby': props.error ? errorId.value : undefined,
}));
</script>

<template>
  <div :class="cn('space-y-1', props.class)">
    <Label v-if="label" :for="controlId" :class="cn('flex items-center gap-1', labelClass)">
      <slot name="label">{{ label }}</slot>
      <span v-if="required" class="text-destructive-text" aria-hidden="true">*</span>
    </Label>
    <slot :control="control" />
    <p v-if="error" :id="errorId" class="text-sm text-destructive-text mt-1 break-words">
      {{ error }}
    </p>
  </div>
</template>
