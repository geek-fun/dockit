<template>
  <div @contextmenu.prevent="showContextMenu($event, undefined)" class="file-list-container">
    <n-scrollbar style="height: 100%">
      <div class="scroll-container">
        <div
          v-for="(file, index) in fileList"
          :class="getClass(file, index)"
          @click="handleClick(ClickType.SINGLE, file)"
          @dblclick="handleClick(ClickType.DOUBLE, file)"
          @contextmenu.prevent="showContextMenu($event, file)"
        >
          <n-icon size="30" v-if="file.type === FileType.FOLDER" color="#0e7a0d">
            <Folder />
          </n-icon>
          <span class="file-item-name">{{ file.name }}</span>
          <context-menu
            v-if="contextMenuVisible"
            :position="contextMenuPosition"
            :file="selectedFile"
            @context-menu-action-emit="handleContextMenu"
          />
        </div>
        <new-file-dialog ref="newFileDialogRef" />
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ContextMenuAction, FileItem, FileType, useSourceFileStore } from '../../../store';
import { Folder } from '@vicons/carbon';
import { useLang } from '../../../lang';
import ContextMenu from './context-menu.vue';
import NewFileDialog from './new-file-dialog.vue';

const router = useRouter();
const message = useMessage();
const lang = useLang();
const fileStore = useSourceFileStore();
const { openFolder, deleteFileOrFolder } = fileStore;
const { fileList } = storeToRefs(fileStore);

const activeRef = ref<FileItem>();

enum ClickType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
}

const handleClick = async (type: ClickType, file: FileItem) => {
  activeRef.value = file;
  if (type === ClickType.DOUBLE) {
    if (file.type === FileType.FOLDER) {
      await openFolder(file.path);
    } else {
      if (file.path.endsWith('.search')) {
        router.push({ name: 'Connect', params: { filePath: file.path } });
      } else {
        message.error(lang.t('editor.unsupportedFile'), {
          closable: true,
          keepAliveOnHover: true,
          duration: 3600,
        });
      }
    }
  }
};

const selectedFile = ref<FileItem>();
const newFileDialogRef = ref();
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });

const showContextMenu = (event: MouseEvent, file?: FileItem) => {
  // Prevent the event from propagating further
  event.stopPropagation();
  activeRef.value = file;
  selectedFile.value = file;
  contextMenuPosition.value = { x: event.layerX, y: event.layerY };
  contextMenuVisible.value = true;
};

const handleClickOutside = (event: MouseEvent) => {
  if (!(event.target as HTMLElement).closest('.context-menu')) {
    contextMenuVisible.value = false;
  }
};

const handleContextMenu = (action: ContextMenuAction) => {
  contextMenuVisible.value = false;
  if (action === ContextMenuAction.CONTEXT_MENU_ACTION_OPEN) {
    if (selectedFile.value?.type === FileType.FOLDER) {
      openFolder(selectedFile.value?.path);
    } else {
      if (selectedFile.value?.path.endsWith('.search')) {
        router.push({ name: 'Connect', params: { filePath: selectedFile.value?.path } });
      } else {
        message.error(lang.t('editor.unsupportedFile'), {
          closable: true,
          keepAliveOnHover: true,
          duration: 3600,
        });
      }
    }
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_RENAME) {
    // renameFileOrFolder(selectedFile.value?.path);
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_DELETE) {
    deleteFileOrFolder(selectedFile.value?.path ?? '');
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FILE) {
    newFileDialogRef.value.showModal(FileType.FILE);
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FOLDER) {
    newFileDialogRef.value.showModal(FileType.FOLDER);
  }
};

const getClass = (file: FileItem, index: number) => {
  if (activeRef.value === file) {
    return 'file-item-active';
  } else if (index === fileList.value.length - 1) {
    return 'file-item';
  } else {
    return 'file-item-hover';
  }
};
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style lang="scss" scoped>
.file-list-container {
  flex: 1;
  height: 0;
  padding-bottom: 10px;

  .scroll-container {
    .file-item {
      display: flex;
      width: 100%;
      align-items: center;
      padding: 5px 10px;
      cursor: pointer;

      .file-item-name {
        margin-left: 5px;
      }
    }

    .file-item-hover {
      @extend .file-item;

      &:hover {
        background-color: var(--connect-list-hover-bg);
      }
    }

    .file-item-active {
      @extend .file-item;
      background-color: var(--connect-list-hover-bg);
    }
  }
}
</style>
