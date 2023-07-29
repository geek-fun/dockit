<template>
  <div class="layout-container">
    <the-aside />
    <n-button>Default</n-button>
    <n-button type="tertiary">
      Tertiary
    </n-button>
    <n-button type="primary">
      Primary
    </n-button>
    <n-button type="info">
      Info
    </n-button>
    <n-button type="success">
      Success
    </n-button>
    <n-button type="warning">
      Warning
    </n-button>
    <n-button type="error">
      Error
    </n-button>
  </div>
</template>

<script setup lang="ts">
import TheAside from './components/the-aside.vue';
</script>

<style lang="scss" scoped>
.layout-container {
  height: 100%;
  width: 100%;
  display: flex;
}
</style>
