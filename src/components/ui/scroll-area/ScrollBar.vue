<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ScrollAreaScrollbar, type ScrollAreaScrollbarProps, ScrollAreaThumb } from 'radix-vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<
    ScrollAreaScrollbarProps & {
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    class: undefined,
    orientation: 'vertical',
  },
);
</script>

<template>
  <ScrollAreaScrollbar
    v-bind="props"
    :class="
      cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-1.5 border-l border-l-transparent p-[1px_0]',
        orientation === 'horizontal' && 'h-1.5 flex-col border-t border-t-transparent p-[0_1px]',
        props.class,
      )
    "
  >
    <ScrollAreaThumb class="relative flex-1 rounded-full bg-border/60" />
  </ScrollAreaScrollbar>
</template>
