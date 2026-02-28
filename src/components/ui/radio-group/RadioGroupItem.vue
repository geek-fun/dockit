<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { RadioGroupIndicator, RadioGroupItem, type RadioGroupItemProps } from 'radix-vue';
import { Circle } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<
  RadioGroupItemProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <RadioGroupItem
    v-bind="props"
    :class="
      cn(
        'aspect-square h-4 w-4 rounded-full border border-primary text-primary focus:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <RadioGroupIndicator class="flex items-center justify-center">
      <Circle class="h-2.5 w-2.5 fill-current text-current" />
    </RadioGroupIndicator>
  </RadioGroupItem>
</template>
