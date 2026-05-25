<script setup lang="ts">
import { ref, computed, unref, type HTMLAttributes } from 'vue';
import { ScrollAreaRoot, type ScrollAreaRootProps, ScrollAreaViewport } from 'radix-vue';
import ScrollBar from './ScrollBar.vue';
import { cn } from '@/lib/utils';

const props = defineProps<
  ScrollAreaRootProps & {
    class?: HTMLAttributes['class'];
  }
>();

const viewportRef = ref<InstanceType<typeof ScrollAreaViewport> | null>(null);
const viewportElement = computed<HTMLElement | null>(() => {
  const raw = viewportRef.value?.viewportElement;
  // radix-vue exposes viewportElement as Ref<HTMLElement | undefined>;
  // use unref to safely unwrap and also handle plain HTMLElement values
  return raw ? (unref(raw) ?? null) : null;
});

defineExpose({ viewportElement });
</script>

<template>
  <ScrollAreaRoot :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport ref="viewportRef" class="h-full w-full rounded-[inherit] pr-1.5">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <slot name="scrollbar" />
  </ScrollAreaRoot>
</template>
