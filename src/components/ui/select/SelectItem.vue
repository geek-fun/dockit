<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectItem, SelectItemIndicator, SelectItemText, type SelectItemProps } from 'radix-vue';
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
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:text-primary',
        props.class,
      )
    "
  >
    <SelectItemText>
      <slot />
    </SelectItemText>

    <span class="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="w-4 h-4 text-primary" />
      </SelectItemIndicator>
    </span>
  </SelectItem>
</template>
