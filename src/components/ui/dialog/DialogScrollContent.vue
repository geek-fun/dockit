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
      class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <DialogContent
        v-bind="forwarded"
        :class="
          cn(
            'relative z-50 grid w-full max-w-lg my-4 gap-4 border border-border bg-background p-6 shadow-lg duration-200 sm:rounded-lg',
            props.class,
          )
        "
      >
        <slot />

        <DialogClose
          v-if="showClose"
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X class="w-4 h-4" />
          <span class="sr-only">Close</span>
        </DialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
