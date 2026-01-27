<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Separator, type SeparatorProps } from 'radix-vue';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<
    SeparatorProps & {
      class?: HTMLAttributes['class'];
    }
  >(),
  {
    orientation: 'horizontal',
    decorative: true,
  },
);
</script>

<template>
  <Separator
    v-bind="props"
    :class="
      cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        props.class,
      )
    "
  />
</template>
