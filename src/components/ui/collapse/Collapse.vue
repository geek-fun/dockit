<script setup lang="ts">
import { AccordionRoot } from 'radix-vue';
import { cn } from '@/lib/utils';

interface CollapseProps {
  type?: 'single' | 'multiple';
  collapsible?: boolean;
  defaultValue?: string | string[];
  class?: string;
}

const props = withDefaults(defineProps<CollapseProps>(), {
  type: 'single',
  collapsible: true,
});
</script>

<template>
  <AccordionRoot
    :type="type"
    :collapsible="collapsible"
    :default-value="defaultValue"
    :class="cn('w-full', props.class)"
  >
    <slot />
  </AccordionRoot>
</template>
