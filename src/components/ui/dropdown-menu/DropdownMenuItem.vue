<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DropdownMenuItem, type DropdownMenuItemProps } from 'radix-vue';
import { cn } from '@/lib/utils';

const props = defineProps<
  DropdownMenuItemProps & {
    class?: HTMLAttributes['class'];
    inset?: boolean;
  }
>();
</script>

<template>
  <DropdownMenuItem
    v-bind="props"
    :class="
      cn(
        'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
