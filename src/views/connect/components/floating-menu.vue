<template>
  <Button class="floating-button" variant="default" size="icon" @click="handleAddClick">
    <span class="i-carbon-add h-8 w-8" />
  </Button>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button';

const emit = defineEmits(['add']);
const handleAddClick = () => {
  emit('add');
};
</script>

<style scoped>
.floating-button {
  position: fixed;
  bottom: 40px;
  right: 80px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
