<template>
  <Tooltip :delay-duration="700">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipContent side="right">
      <span>{{ popoverContent }}</span>
    </TooltipContent>
  </Tooltip>
</template>
<script lang="ts" setup>
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

defineProps({ popoverContent: String });
</script>
