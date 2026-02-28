<template>
  <div class="tool-bar-container">
    <TooltipProvider>
      <Tooltip v-for="toolBar in toolBarList" :key="toolBar.id">
        <TooltipTrigger as-child>
          <span
            :class="[toolBar.iconClass, 'tool-bar-item h-6 w-6']"
            @click="handleToolBarAction(toolBar.id)"
          />
        </TooltipTrigger>
        <TooltipContent>
          {{ toolBar.title }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <path-breadcrumb />
    <div class="sort-container">
      <Select v-model="sortBy" @update:model-value="handleSortChange">
        <SelectTrigger class="w-[140px] h-8">
          <SelectValue :placeholder="$t('file.sortBy.name')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="option in sortOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <new-file-dialog ref="newFileDialogRef" />
  </div>
</template>

<script setup lang="ts">
import { ContextMenuAction, SortBy, ToolBarAction, useFileStore } from '../../../store';
import { useLang } from '../../../lang';
import NewFileDialog from './new-file-dialog.vue';
import PathBreadcrumb from '../../../components/path-breadcrumb.vue';
import { storeToRefs } from 'pinia';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const fileStore = useFileStore();
const { selectDirectory, setSortBy } = fileStore;
const { sortBy } = storeToRefs(fileStore);

const lang = useLang();

const newFileDialogRef = ref();

const sortOptions = computed(() => [
  { label: lang.t('file.sortBy.name'), value: SortBy.NAME },
  { label: lang.t('file.sortBy.dateModified'), value: SortBy.DATE },
  { label: lang.t('file.sortBy.size'), value: SortBy.SIZE },
]);

const toolBarList = [
  {
    id: ToolBarAction.ADD_DOCUMENT,
    iconClass: 'i-carbon-document-add',
    title: lang.t('file.newFile'),
  },
  {
    id: ToolBarAction.ADD_FOLDER,
    iconClass: 'i-carbon-folder-add',
    title: lang.t('file.newFolder'),
  },
  {
    id: ToolBarAction.OPEN_FOLDER,
    iconClass: 'i-carbon-folder-open',
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

const handleSortChange = (value: string) => {
  setSortBy(value as SortBy);
};
</script>

<style scoped>
.tool-bar-container {
  height: var(--tool-bar-height);
  width: 100%;
  display: flex;
  align-items: center;
  border-bottom: 1px solid hsl(var(--border));
}

.tool-bar-item {
  margin: 0 5px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  color: gray;
}

.tool-bar-item:hover {
  color: hsl(var(--primary));
}

.sort-container {
  margin-left: auto;
  margin-right: 10px;
}
</style>
