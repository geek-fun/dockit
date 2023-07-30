<template>
  <n-popover placement="right" trigger="hover" :delay="700">
    <template #trigger>
      <slot />
    </template>
    <span>{{ popoverContent }}</span>
  </n-popover>
</template>
<script lang="ts" setup>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  popoverContent: String,
});
</script>
