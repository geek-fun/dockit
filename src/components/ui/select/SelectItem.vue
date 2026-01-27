<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectItem, SelectItemIndicator, type SelectItemProps } from 'radix-vue';
import { Check } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<
  SelectItemProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <SelectItem
    v-bind="props"
    :class="
      cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        props.class,
      )
    "
  >
    <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="w-4 h-4" />
      </SelectItemIndicator>
    </span>

    <slot />
  </SelectItem>
</template>
