<script setup lang="ts">
import { computed } from 'vue';
import { CheckboxRoot, CheckboxIndicator } from 'radix-vue';
import { Check } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  class?: string;
}

const props = withDefaults(defineProps<CheckboxProps>(), {
  checked: undefined,
  defaultChecked: false,
  disabled: false,
});

const emit = defineEmits<{
  'update:checked': [value: boolean];
}>();

const modelValue = computed({
  get: () => props.checked,
  set: (val: boolean) => emit('update:checked', val),
});
</script>

<template>
  <CheckboxRoot
    v-model:checked="modelValue"
    :default-checked="defaultChecked"
    :disabled="disabled"
    :class="
      cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        props.class,
      )
    "
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <Check class="h-4 w-4" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
