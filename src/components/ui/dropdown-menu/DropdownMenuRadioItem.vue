<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import {
  DropdownMenuRadioItem,
  type DropdownMenuRadioItemEmits,
  type DropdownMenuRadioItemProps,
  DropdownMenuItemIndicator,
} from 'radix-vue';
import { Circle } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<
  DropdownMenuRadioItemProps & {
    class?: HTMLAttributes['class'];
  }
>();

const emits = defineEmits<DropdownMenuRadioItemEmits>();
</script>

<template>
  <DropdownMenuRadioItem
    v-bind="props"
    :class="
      cn(
        'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        props.class,
      )
    "
    @select="emits('select', $event)"
  >
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuItemIndicator>
        <Circle class="w-2 h-2 fill-current" />
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuRadioItem>
</template>
