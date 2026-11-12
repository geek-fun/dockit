<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Primitive, type PrimitiveProps } from 'radix-vue';
import { type ButtonVariants, buttonVariants } from '.';
import { cn } from '../../../lib/utils';

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  variant: undefined,
  size: undefined,
  class: undefined,
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    class="button-control"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>

<style scoped>
.button-control:focus-visible {
  outline: 2px solid hsl(var(--foreground));
  outline-offset: 2px;
}
</style>
