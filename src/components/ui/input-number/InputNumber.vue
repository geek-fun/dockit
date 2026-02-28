<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

interface Props {
  modelValue?: number | null;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  class?: HTMLAttributes['class'];
  showButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  placeholder: '',
  disabled: false,
  min: undefined,
  max: undefined,
  step: 1,
  class: undefined,
  showButton: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
}>();

const inputValue = computed({
  get: () => props.modelValue ?? null,
  set: (val: number | string | null) => {
    if (val === null || val === '') {
      emit('update:modelValue', null);
    } else {
      // Validate string input before parsing
      const trimmedVal = typeof val === 'string' ? val.trim() : val;
      if (trimmedVal === '' || trimmedVal === null) {
        emit('update:modelValue', null);
        return;
      }
      const num = typeof trimmedVal === 'string' ? parseFloat(trimmedVal) : trimmedVal;
      if (!isNaN(num)) {
        let value = num;
        if (props.min !== undefined) value = Math.max(props.min, value);
        if (props.max !== undefined) value = Math.min(props.max, value);
        emit('update:modelValue', value);
      }
    }
  },
});

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  inputValue.value = target.value;
};

const increment = () => {
  if (props.disabled) return;
  const current = inputValue.value ?? 0;
  const newValue = current + props.step;
  if (props.max === undefined || newValue <= props.max) {
    inputValue.value = newValue;
  }
};

const decrement = () => {
  if (props.disabled) return;
  const current = inputValue.value ?? 0;
  const newValue = current - props.step;
  if (props.min === undefined || newValue >= props.min) {
    inputValue.value = newValue;
  }
};
</script>

<template>
  <div
    :class="
      cn(
        'flex h-10 w-full rounded-md border border-border bg-background text-sm',
        'focus-within:ring-1 focus-within:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
        props.class,
      )
    "
  >
    <input
      type="number"
      :value="inputValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :min="min"
      :max="max"
      :step="step"
      :class="
        cn(
          'flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )
      "
      @input="handleInput"
    />
    <div v-if="showButton" class="flex flex-col border-l border-border">
      <button
        type="button"
        :disabled="disabled || (max !== undefined && (inputValue ?? 0) >= max)"
        class="flex-1 px-2 hover:bg-muted disabled:opacity-50"
        @click="increment"
      >
        <span class="text-xs">▲</span>
      </button>
      <button
        type="button"
        :disabled="disabled || (min !== undefined && (inputValue ?? 0) <= min)"
        class="flex-1 px-2 border-t border-border hover:bg-muted disabled:opacity-50"
        @click="decrement"
      >
        <span class="text-xs">▼</span>
      </button>
    </div>
  </div>
</template>
