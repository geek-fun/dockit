<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

interface UnoIconProps {
  icon: string;
  size?: number | string;
  color?: string;
  class?: string;
}

const props = withDefaults(defineProps<UnoIconProps>(), {
  size: 16,
  color: undefined,
  class: undefined,
});

const iconClass = computed(() => props.icon);

const iconStyle = computed(() => ({
  width: typeof props.size === 'number' ? `${props.size}px` : props.size,
  height: typeof props.size === 'number' ? `${props.size}px` : props.size,
  color: props.color,
}));
</script>

<template>
  <span
    :class="cn('inline-flex items-center justify-center', iconClass, props.class)"
    :style="iconStyle"
  />
</template>
