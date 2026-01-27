<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { DialogDescription, type DialogDescriptionProps } from 'radix-vue';
import { cn } from '@/lib/utils';

const props = defineProps<
  DialogDescriptionProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <DialogDescription :class="cn('text-sm text-muted-foreground', props.class)">
    <slot />
  </DialogDescription>
</template>
