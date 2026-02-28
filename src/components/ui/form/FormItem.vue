<script setup lang="ts">
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface FormItemProps {
  label?: string;
  required?: boolean;
  class?: string;
  labelWidth?: string | number;
}

const props = withDefaults(defineProps<FormItemProps>(), {
  required: false,
});
</script>

<template>
  <div :class="cn('space-y-2', props.class)">
    <Label v-if="label" class="flex items-center gap-1">
      {{ label }}
      <span v-if="required" class="text-destructive">*</span>
    </Label>
    <slot />
  </div>
</template>
