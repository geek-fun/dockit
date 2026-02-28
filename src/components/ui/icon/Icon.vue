<script setup lang="ts">
import { computed, type Component } from 'vue';
import { cn } from '@/lib/utils';

interface IconProps {
  size?: number | string;
  color?: string;
  component?: Component;
  class?: string;
}

const props = withDefaults(defineProps<IconProps>(), {
  size: 16,
  color: undefined,
  component: undefined,
  class: undefined,
});

const iconStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  color: props.color,
}));
</script>

<template>
  <span :class="cn('inline-flex items-center justify-center', props.class)" :style="iconStyle">
    <component :is="component" v-if="component" class="h-full w-full" />
    <slot v-else />
  </span>
</template>
