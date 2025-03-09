<template>
  <n-float-button
    position="fixed"
    type="primary"
    menu-trigger="click"
    bottom="40px"
    right="80px"
    width="50px"
    height="50px"
  >
    <n-icon size="32">
      <Add />
    </n-icon>
    <template #menu>
      <n-float-button @click="handleAddClick" type="primary" width="50px" height="50px">
        <n-icon size="32">
          <Add />
        </n-icon>
        <!--        <template #description>New Connection</template>-->
      </n-float-button>
      <!--      <n-float-button>-->
      <!--        <n-icon size="24">-->
      <!--          <Add />-->
      <!--        </n-icon>-->
      <!--      </n-float-button>-->
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
