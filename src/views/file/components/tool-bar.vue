<template>
  <div class="tool-bar-container">
    <n-tooltip trigger="hover" v-for="toolBar in toolBarList">
      <template #trigger>
        <n-icon size="26" class="tool-bar-item" @click="handleToolBarAction(toolBar.id)">
          <component :is="toolBar.icon" />
        </n-icon>
      </template>
      {{ toolBar.title }}
    </n-tooltip>
    <n-breadcrumb>
      <n-breadcrumb-item v-if="folderPath" v-for="path in folderPath?.split('/')">
        <n-icon :component="Folder" />
        {{ path }}
      </n-breadcrumb-item>
    </n-breadcrumb>
  </div>
</template>

<script setup lang="ts">
import { DocumentAdd, FolderAdd, FolderOpen, Folder } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { ToolBarAction, useSourceFileStore } from '../../../store';

const fileStore = useSourceFileStore();
const { openFolder } = fileStore;
const { folderPath } = storeToRefs(fileStore);

const toolBarList = [
  {
    id: ToolBarAction.ADD_DOCUMENT,
    icon: DocumentAdd,
    title: 'Add Document',
  },
  {
    id: ToolBarAction.ADD_FOLDER,
    icon: FolderAdd,
    title: 'Add Folder',
  },
  {
    id: ToolBarAction.OPEN_FOLDER,
    icon: FolderOpen,
    title: 'Open Folder',
  },
];

const handleToolBarAction = async (id: ToolBarAction) => {
  if (id === ToolBarAction.ADD_DOCUMENT) {
  } else if (id === ToolBarAction.ADD_FOLDER) {
  } else if (id === ToolBarAction.OPEN_FOLDER) {
    await openFolder();
  }
};
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
