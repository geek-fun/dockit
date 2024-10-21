<template>
  <tool-bar />
  <file-list />
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
import FileList from './components/file-list.vue';
</script>

<style lang="scss" scoped>
.file-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
