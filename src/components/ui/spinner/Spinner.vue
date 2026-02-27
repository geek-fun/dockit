<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  show?: boolean;
  size?: 'sm' | 'md' | 'lg';
  class?: string;
}

const props = withDefaults(defineProps<SpinnerProps>(), {
  show: true,
  size: 'md',
  class: undefined,
});

const sizeClass = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};
</script>

<template>
  <div v-if="show" :class="cn('flex items-center justify-center', props.class)">
    <Loader2 :class="cn('animate-spin text-primary', sizeClass[size])" />
    <span v-if="$slots.default" class="ml-2">
      <slot />
    </span>
  </div>
</template>
