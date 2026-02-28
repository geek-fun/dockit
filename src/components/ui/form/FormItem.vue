<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FormItemProps {
  label?: string;
  required?: boolean;
  class?: string;
  labelWidth?: string | number;
  error?: string;
}

const props = withDefaults(defineProps<FormItemProps>(), {
  required: false,
  label: undefined,
  class: undefined,
  labelWidth: undefined,
  error: undefined,
});
</script>

<template>
  <div :class="cn('space-y-1', props.class)">
    <Label v-if="label" class="flex items-center gap-1">
      {{ label }}
      <span v-if="required" class="text-destructive">*</span>
    </Label>
    <slot />
    <p v-if="error" class="text-sm text-destructive mt-1">{{ error }}</p>
  </div>
</template>
