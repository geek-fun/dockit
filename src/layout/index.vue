<template>
  <div class="layout-container">
    <the-aside />
    <div class="main-layout">
      <router-main />
    </div>
    <tool-bar-right />
  </div>
</template>

<script setup lang="ts">
import TheAside from './components/the-aside.vue';
import RouterMain from '../components/RouterMain.vue';
import ToolBarRight from './components/tool-bar-right.vue';
</script>

<style scoped>
.layout-container {
  height: 100%;
  width: 100%;
  display: flex;
}

.main-layout {
  flex: 1;
  width: 0;
}
</style>
