<template>
  <n-float-button
    position="fixed"
    type="primary"
    menu-trigger="click"
    bottom="40px"
    right="80px"
    width="40px"
    height="40px"
  >
    <n-icon size="24">
      <Add />
    </n-icon>
    <template #menu>
      <n-float-button @click="handleAddClick">
        <n-icon size="24">
          <Add />
        </n-icon>
        <template #description>Add Connection</template>
      </n-float-button>
      <n-float-button>
        <n-icon size="24">
          <Add />
        </n-icon>
      </n-float-button>
    </template>
  </n-float-button>
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';

const emit = defineEmits(['add']);
const handleAddClick = () => {
  emit('add');
};
</script>

<style lang="scss" scoped></style>
