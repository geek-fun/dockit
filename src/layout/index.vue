<template>
  <div class="layout-container">
    <the-aside />
    <div class="right-layout">
      <router-main />
    </div>
  </div>
</template>

<script setup lang="ts">
import TheAside from './components/the-aside.vue';
import RouterMain from '../components/RouterMain.vue';
</script>

<style lang="scss" scoped>
.layout-container {
  height: 100%;
  width: 100%;
  display: flex;
  .right-layout {
    flex: 1;
    width: 0;
  }
}
</style>
