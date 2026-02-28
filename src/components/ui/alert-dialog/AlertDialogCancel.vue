<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { AlertDialogCancel, type AlertDialogCancelProps } from 'radix-vue';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const props = defineProps<
  AlertDialogCancelProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>

<template>
  <AlertDialogCancel :class="cn(buttonVariants({ variant: 'outline' }), props.class)">
    <slot />
  </AlertDialogCancel>
</template>
