<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface GridItemProps {
  span?: number;
  offset?: number;
  class?: string;
}

const props = withDefaults(defineProps<GridItemProps>(), {
  span: 1,
  offset: 0,
  class: undefined,
});

const gridItemStyle = computed(() => ({
  gridColumn: props.offset > 0 ? `${props.offset + 1} / span ${props.span}` : `span ${props.span}`,
}));
</script>

<template>
  <div :style="gridItemStyle" :class="cn(props.class)">
    <slot />
  </div>
</template>
