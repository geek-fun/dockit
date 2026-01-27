<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Label, type LabelProps } from 'radix-vue';
import { cn } from '@/lib/utils';
import { labelVariants } from '.';

const props = defineProps<
  LabelProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <Label v-bind="props" :class="cn(labelVariants(), props.class)">
    <slot />
  </Label>
</template>
