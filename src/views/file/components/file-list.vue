<template>
  <div @contextmenu.prevent="showContextMenu($event, undefined)" class="file-container">
    <div
      v-for="file in fileList"
      class="file-item"
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
        @close-context-menu="handleCloseContextMenu"
      />
      <new-file-dialog ref="newFileDialogRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { FileItem, FileType, useSourceFileStore } from '../../../store';
import { Folder } from '@vicons/carbon';
import { useLang } from '../../../lang';
import ContextMenu from './context-menu.vue';
import NewFileDialog from './new-file-dialog.vue';

const router = useRouter();
const message = useMessage();
const lang = useLang();
const fileStore = useSourceFileStore();
const { openFolder } = fileStore;
const { fileList } = storeToRefs(fileStore);

const activeRef = ref({} as FileItem);

enum ClickType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
}

const handleClick = async (type: ClickType, file: FileItem) => {
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
  } else {
    activeRef.value = file;
  }
};

const selectedFile = ref<FileItem>();
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });

const showContextMenu = (event: MouseEvent, file?: FileItem) => {
  selectedFile.value = file;
  contextMenuPosition.value = { x: event.clientX, y: event.clientY };
  contextMenuVisible.value = true;
};

const handleClickOutside = (event: MouseEvent) => {
  if (!(event.target as HTMLElement).closest('.context-menu')) {
    contextMenuVisible.value = false;
  }
};
const handleCloseContextMenu = () => {
  console.log(`handleCloseContextMenu`);
  contextMenuVisible.value = false;
  console.log(`handleCloseContextMenu: ${contextMenuVisible.value}`);
};
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style lang="scss" scoped>
.file-container {
  width: 100%;
  height: 100%;

  .file-item {
    display: flex;
    align-items: center;
    padding: 5px 10px;
    cursor: pointer;

    .file-item-name {
      margin-left: 5px;
    }
  }
}
</style>
