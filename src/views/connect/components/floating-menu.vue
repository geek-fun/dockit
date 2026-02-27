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
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.floating-button:hover {
  transform: scale(1.1) rotate(90deg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.floating-button:active {
  transform: scale(0.95) rotate(90deg);
}
</style>
