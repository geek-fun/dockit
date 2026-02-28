<script setup lang="ts">
import {
  AlertDialogRoot,
  type AlertDialogEmits,
  type AlertDialogProps,
  useForwardPropsEmits,
} from 'radix-vue';

const props = defineProps<AlertDialogProps>();
const emits = defineEmits<AlertDialogEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <AlertDialogRoot v-bind="forwarded">
    <slot />
  </AlertDialogRoot>
</template>
