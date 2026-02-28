<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DropdownMenuSeparator, type DropdownMenuSeparatorProps } from 'radix-vue';
import { cn } from '@/lib/utils';

const props = defineProps<
  DropdownMenuSeparatorProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <DropdownMenuSeparator :class="cn('-mx-1 my-1 h-px bg-muted', props.class)" />
</template>
