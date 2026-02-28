<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ScrollAreaRoot, type ScrollAreaRootProps, ScrollAreaViewport } from 'radix-vue';
import ScrollBar from './ScrollBar.vue';
import { cn } from '@/lib/utils';

const props = defineProps<
  ScrollAreaRootProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <ScrollAreaRoot :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <slot name="scrollbar" />
  </ScrollAreaRoot>
</template>
