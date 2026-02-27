<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface GridProps {
  cols?: number | string;
  xGap?: number | string;
  yGap?: number | string;
  class?: string;
}

const props = withDefaults(defineProps<GridProps>(), {
  cols: 24,
  xGap: 0,
  yGap: 0,
  class: undefined,
});

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.cols}, minmax(0, 1fr))`,
  columnGap: typeof props.xGap === 'number' ? `${props.xGap}px` : props.xGap,
  rowGap: typeof props.yGap === 'number' ? `${props.yGap}px` : props.yGap,
}));
</script>

<template>
  <div :style="gridStyle" :class="cn('w-full', props.class)">
    <slot />
  </div>
</template>
