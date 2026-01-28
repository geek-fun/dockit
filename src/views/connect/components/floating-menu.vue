<template>
  <Button class="floating-button" variant="default" size="icon" @click="handleAddClick">
    <Icon :size="32">
      <Add />
    </Icon>
  </Button>
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

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
}
</style>
