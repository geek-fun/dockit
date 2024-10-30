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
    <n-breadcrumb class="tool-bar-path-breadcrumb">
      <n-breadcrumb-item
        v-if="folderPath"
        v-for="(path, index) in folderPath?.split('/')"
        @click="handleBreadcrumb(index)"
      >
        <n-icon :component="Folder" v-if="index !== 0" />
        {{ path }}
      </n-breadcrumb-item>
    </n-breadcrumb>
  </div>
</template>

<script setup lang="ts">
import { DocumentAdd, FolderAdd, FolderOpen, Folder } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { ToolBarAction, useSourceFileStore } from '../../../store';
import { CustomError } from '../../../common';

const fileStore = useSourceFileStore();
const { openFolder } = fileStore;
const { folderPath } = storeToRefs(fileStore);

const message = useMessage();

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

const handleBreadcrumb = async (index: number) => {
  const subPath = folderPath?.value
    ?.split('/')
    .splice(0, index + 1)
    .join('/');
  try {
    await openFolder(subPath);
  } catch (error) {
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
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
    align-items: flex-start;
  }
  .tool-bar-path-breadcrumb {
    overflow: scroll;
    scrollbar-width: none; /* For Firefox */
    -ms-overflow-style: none; /* For Internet Explorer and Edge */

    &::-webkit-scrollbar {
      display: none; /* For Chrome, Safari, and Opera */
    }
  }
}
</style>
