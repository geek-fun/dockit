<template>
  <div v-for="file in fileList" class="file-item">
    <n-icon size="30" v-if="file.type === FileType.FOLDER" color="#0e7a0d">
      <Folder />
    </n-icon>
    <span class="file-item-name">{{ file.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { FileType, useSourceFileStore } from '../../../store';
import { Folder } from '@vicons/carbon';

const fileStore = useSourceFileStore();
const { fileList } = storeToRefs(fileStore);
</script>

<style lang="scss" scoped>
.file-item {
  display: flex;
  align-items: center;
  padding: 5px 10px;
  cursor: pointer;
  .file-item-name {
    margin-left: 5px;
  }
}
</style>
