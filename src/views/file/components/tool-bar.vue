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
  </div>
</template>

<script setup lang="ts">
import { open } from '@tauri-apps/api/dialog';
import { DocumentAdd, FolderAdd, FolderOpen } from '@vicons/carbon';

enum ToolBarAction {
  ADD_DOCUMENT = 'ADD_DOCUMENT',
  ADD_FOLDER = 'ADD_FOLDER',
  OPEN_FOLDER = 'OPEN_FOLDER',
}

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
    console.log('Add Document');
  } else if (id === ToolBarAction.ADD_FOLDER) {
    console.log('Add Folder');
  } else if (id === ToolBarAction.OPEN_FOLDER) {
    try {
      const selectedFiles = await open({
        multiple: false,
        directory: true,
      });
      console.log('Selected files:', selectedFiles);
    } catch (error) {
      console.error('Failed to open file dialog:', error);
    }
    console.log(id);
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
