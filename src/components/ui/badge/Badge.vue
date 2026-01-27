<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { type BadgeVariants, badgeVariants } from '.';
import { cn } from '../../../lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
  variant?: BadgeVariants['variant'];
}>();
</script>

<template>
  <div :class="cn(badgeVariants({ variant }), props.class)">
    <slot />
  </div>
</template>
