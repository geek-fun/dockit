<template>
  <div class="tool-bar-container">
    <n-tooltip trigger="hover" v-for="toolBar in toolBarList" :key="toolBar.id">
      <template #trigger>
        <n-icon size="26" class="tool-bar-item" @click="handleToolBarAction(toolBar.id)">
          <component :is="toolBar.icon" />
        </n-icon>
      </template>
      {{ toolBar.title }}
    </n-tooltip>
    <div class="sort-container">
      <n-select
        v-model:value="currentSort"
        :options="sortOptions"
        size="small"
        style="width: 140px"
        @update:value="handleSortChange"
      />
    </div>
    <path-breadcrumb />
    <new-file-dialog ref="newFileDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { DocumentAdd, FolderAdd, FolderOpen } from '@vicons/carbon';
import { ContextMenuAction, SortBy, ToolBarAction, useFileStore } from '../../../store';
import { useLang } from '../../../lang';
import NewFileDialog from './new-file-dialog.vue';
import PathBreadcrumb from '../../../components/path-breadcrumb.vue';
import { storeToRefs } from 'pinia';

const fileStore = useFileStore();
const { selectDirectory, setSortBy } = fileStore;
const { sortBy } = storeToRefs(fileStore);

const lang = useLang();

const newFileDialogRef = ref();
const currentSort = ref(sortBy.value);

const sortOptions = [
  { label: 'Name', value: SortBy.NAME },
  { label: 'Date Modified', value: SortBy.DATE },
  { label: 'Size', value: SortBy.SIZE },
];

const toolBarList = [
  {
    id: ToolBarAction.ADD_DOCUMENT,
    icon: DocumentAdd,
    title: lang.t('file.newFile'),
  },
  {
    id: ToolBarAction.ADD_FOLDER,
    icon: FolderAdd,
    title: lang.t('file.newFolder'),
  },
  {
    id: ToolBarAction.OPEN_FOLDER,
    icon: FolderOpen,
    title: lang.t('file.open'),
  },
];

const handleToolBarAction = async (id: ToolBarAction) => {
  if (id === ToolBarAction.ADD_DOCUMENT) {
    newFileDialogRef.value.showModal(ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FILE);
  } else if (id === ToolBarAction.ADD_FOLDER) {
    newFileDialogRef.value.showModal(ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FOLDER);
  } else if (id === ToolBarAction.OPEN_FOLDER) {
    await selectDirectory();
  }
};

const handleSortChange = (value: SortBy) => {
  setSortBy(value);
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
    color: gray;

    &:hover {
      color: var(--theme-color);
    }
  }

  .sort-container {
    margin-left: auto;
    margin-right: 10px;
  }
}
</style>
