<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue';
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'radix-vue';
import { X } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface Props extends DialogContentProps {
  class?: HTMLAttributes['class'];
  showClose?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  class: undefined,
  showClose: true,
});

const emits = defineEmits<DialogContentEmits>();

const delegatedProps = computed(() => {
  const { class: _, showClose: __, ...delegated } = props;
  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-3 border border-border bg-background p-4 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg',
          props.class,
        )
      "
    >
      <slot />

      <DialogClose v-if="showClose" class="dialog-close-button">
        <X class="w-4 h-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
.dialog-close-button {
  position: absolute;
  right: 1rem;
  top: 1rem;
  border-radius: 0.125rem;
  opacity: 0.7;
  transition: opacity 0.2s;
  background: transparent;
  border: none;
  padding: 0;
  color: inherit;
}

.dialog-close-button:hover {
  opacity: 1;
  background: transparent;
}

.dialog-close-button:focus {
  outline: none;
}

.dialog-close-button:focus-visible {
  outline: 1px solid hsl(var(--ring));
  outline-offset: 0;
}

.dialog-close-button:disabled {
  pointer-events: none;
}
</style>
