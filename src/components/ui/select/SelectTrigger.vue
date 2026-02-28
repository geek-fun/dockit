<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { SelectIcon, SelectTrigger, type SelectTriggerProps } from 'radix-vue';
import { ChevronDown } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<
  SelectTriggerProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <SelectTrigger
    v-bind="props"
    :class="
      cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <slot name="icon">
        <ChevronDown class="w-4 h-4 opacity-50" />
      </slot>
    </SelectIcon>
  </SelectTrigger>
</template>
