<script setup lang="ts">
import {
  ContextMenuRoot,
  type ContextMenuRootEmits,
  type ContextMenuRootProps,
  useForwardPropsEmits,
} from 'radix-vue';

const props = defineProps<ContextMenuRootProps>();
const emits = defineEmits<ContextMenuRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ContextMenuRoot v-bind="forwarded">
    <slot />
  </ContextMenuRoot>
</template>
