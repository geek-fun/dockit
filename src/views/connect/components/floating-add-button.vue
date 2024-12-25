<template>
  <div class="floating-button-container">
    <div class="sub-buttons" :class="{ active: isActive }">
      <n-button quaternary circle class="sub-button" @click="handleAddClick">
        <template #icon>
          <n-icon size="28">
            <Add />
          </n-icon>
        </template>
      </n-button>
    </div>
    <n-button quaternary circle class="main-button" @click="toggleActive" :class="{ active: isActive }">
      <template #icon>
        <n-icon size="32">
          <component :is="isActive ? Close : Add" />
        </n-icon>
      </template>
    </n-button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NIcon } from 'naive-ui';
import { Add, Close } from '@vicons/carbon';

defineOptions({
  name: 'FloatingAddButton'
});

const emit = defineEmits(['add']);
const isActive = ref(false);

const toggleActive = () => {
  isActive.value = !isActive.value;
};

const handleAddClick = () => {
  emit('add');
  isActive.value = false;
};
</script>

<style lang="scss" scoped>
.floating-button-container {
  position: fixed;
  right: 48px;
  bottom: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1000;

  .main-button {
    color: #fff;
    background-color: var(--success-color, #18a058);
    border: none;
    width: 56px;
    height: 56px;
    transition: all 0.3s ease;
    
    &:hover {
      background-color: var(--success-hover-color, #36ad6a);
      transform: scale(1.1);
    }
    
    &.active {
      transform: rotate(90deg);
    }
  }

  .sub-buttons {
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    opacity: 0;
    transform: translateY(10px);
    pointer-events: none;
    transition: all 0.3s ease;

    &.active {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }

    .sub-button {
      color: #fff;
      background-color: var(--success-color, #18a058);
      border: none;
      width: 48px;
      height: 48px;
      
      &:hover {
        background-color: var(--success-hover-color, #36ad6a);
        transform: scale(1.1);
      }
    }
  }
}
</style> 