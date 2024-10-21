<template>
  <div class="tool-bar-container">
    <n-tooltip trigger="hover" v-for="toolBar in toolBarList">
      <template #trigger>
        <n-icon size="26" class="tool-bar-item">
          <component :is="toolBar.icon" />
        </n-icon>
      </template>
      {{ toolBar.title }}
    </n-tooltip>
  </div>
</template>

<script setup lang="ts">
import { DocumentAdd, FolderAdd, FolderOpen } from '@vicons/carbon';

const toolBarList = [
  {
    id: 'add-document',
    icon: DocumentAdd,
    title: 'Add Document',
  },
  {
    id: 'add-folder',
    icon: FolderAdd,
    title: 'Add Folder',
  },
  {
    id: 'open-folder',
    icon: FolderOpen,
    title: 'Open Folder',
  },
];
</script>

<style lang="scss" scoped>
.tool-bar-container {
  height: var(--tool-bar-height);
  width: 100%;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);

  .tool-bar-item {
    margin: 0 5px;
    cursor: pointer;
    display: flex;
    align-items: center;

    .n-icon {
      opacity: 0.4;
      transition: 0.3s;
    }

    &:hover {
      .n-icon {
        opacity: 0.9;
      }
    }
  }
}
</style>
