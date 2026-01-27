<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<{
  type?: 'success' | 'error' | 'warning' | 'info';
  closable?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const typeClasses = computed(() => {
  switch (props.type) {
    case 'success':
      return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200';
    case 'error':
      return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200';
    case 'warning':
      return 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200';
    case 'info':
    default:
      return 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200';
  }
});
</script>

<template>
  <div
    :class="
      cn(
        'pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 shadow-lg transition-all',
        typeClasses,
      )
    "
  >
    <div class="flex-1 text-sm font-medium">
      <slot />
    </div>
    <button
      v-if="closable"
      class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-50 hover:opacity-100 focus:outline-none"
      @click="emit('close')"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
</template>
