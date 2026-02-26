<script setup lang="ts">
import { computed } from 'vue';
import { ProgressRoot, ProgressIndicator } from 'radix-vue';
import { cn } from '@/lib/utils';

interface ProgressProps {
  percentage?: number;
  modelValue?: number;
  class?: string;
  indicatorClass?: string;
  type?: 'line' | 'circle';
  status?: 'success' | 'error' | 'warning' | 'info';
}

const props = withDefaults(defineProps<ProgressProps>(), {
  percentage: 0,
  modelValue: undefined,
  type: 'line',
});

const value = computed(() => props.modelValue ?? props.percentage);

const statusClass = computed(() => {
  switch (props.status) {
    case 'success':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    case 'warning':
      return 'bg-yellow-500';
    default:
      return 'bg-primary';
  }
});
</script>

<template>
  <ProgressRoot
    v-model="value"
    :class="cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', props.class)"
  >
    <ProgressIndicator
      :class="cn('h-full w-full flex-1 transition-all', statusClass, indicatorClass)"
      :style="{ transform: `translateX(-${100 - value}%)` }"
    />
  </ProgressRoot>
</template>
