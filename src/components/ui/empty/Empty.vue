<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface EmptyProps {
  description?: string;
  class?: string;
}

const props = defineProps<EmptyProps>();
</script>

<template>
  <div
    :class="cn('flex flex-col items-center justify-center py-8 text-muted-foreground', props.class)"
  >
    <slot name="icon">
      <Inbox class="h-12 w-12 mb-4 opacity-50" />
    </slot>
    <p v-if="description" class="text-sm">{{ description }}</p>
    <slot v-else />
    <div v-if="$slots.extra" class="mt-4">
      <slot name="extra" />
    </div>
  </div>
</template>
