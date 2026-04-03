<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template>
  <td :class="cn('px-2 py-1.5 align-middle [&:has([role=checkbox])]:pr-0', props.class)">
    <slot />
  </td>
</template>
