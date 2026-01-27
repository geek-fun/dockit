<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  progress: number;
  isError?: boolean;
  visible?: boolean;
}>();

const barClass = computed(() =>
  cn('h-full transition-all duration-200 ease-out', props.isError ? 'bg-red-500' : 'bg-primary'),
);
</script>

<template>
  <div v-if="visible" class="fixed top-0 left-0 right-0 z-[9999] h-[2px] bg-transparent">
    <div :class="barClass" :style="{ width: `${progress}%` }" />
  </div>
</template>
