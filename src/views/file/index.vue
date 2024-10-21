<template>
  <tool-bar />
  <div class="file-container">file</div>
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
</script>

<style lang="scss" scoped>
.file-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
