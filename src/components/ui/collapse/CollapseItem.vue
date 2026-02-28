<script setup lang="ts">
import { AccordionItem, AccordionHeader, AccordionTrigger, AccordionContent } from 'radix-vue';
import { ChevronDown } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface CollapseItemProps {
  value?: string;
  title?: string;
  name?: string;
  class?: string;
}

const props = defineProps<CollapseItemProps>();

const itemValue = props.value || props.name || 'item';
</script>

<template>
  <AccordionItem :value="itemValue" :class="cn('border-b', props.class)">
    <AccordionHeader class="flex">
      <AccordionTrigger
        class="flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180"
      >
        <slot name="header">{{ title }}</slot>
        <ChevronDown class="h-4 w-4 shrink-0 transition-transform duration-200" />
      </AccordionTrigger>
    </AccordionHeader>
    <AccordionContent
      class="overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    >
      <div class="pb-4 pt-0">
        <slot />
      </div>
    </AccordionContent>
  </AccordionItem>
</template>
