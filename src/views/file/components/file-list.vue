<template>
  <div class="file-list-container" @contextmenu.prevent="showContextMenu($event, undefined)">
    <ScrollArea class="h-full">
      <div class="grid-container">
        <div
          v-for="(file, index) in sortedFileList"
          :key="file.path"
          :class="getClass(file, index)"
          class="focus:ring-2 focus:ring-primary focus:outline-none"
          role="button"
          tabindex="0"
          @click="handleClick(ClickType.SINGLE, file)"
          @dblclick="handleClick(ClickType.DOUBLE, file)"
          @keydown.enter="handleClick(ClickType.DOUBLE, file)"
          @keydown.space.prevent="handleClick(ClickType.SINGLE, file)"
          @keydown.right.prevent="focusFileNode(index + 1)"
          @keydown.left.prevent="focusFileNode(index - 1)"
          @keydown.down.prevent="focusFileNode(index + getGridColumns())"
          @keydown.up.prevent="focusFileNode(index - getGridColumns())"
          @keydown.shift.f10.prevent="openContextMenuForKeyboard($event, file)"
          @contextmenu.prevent="showContextMenu($event, file)"
        >
          <div class="file-icon">
            <span
              v-if="file.type === PathTypeEnum.FOLDER"
              class="i-carbon-folder h-9 w-9 text-green-600"
            />
            <span v-else class="i-carbon-document h-9 w-9 text-gray-500" />
          </div>
          <div class="file-info">
            <span class="file-item-name">{{ file.name }}</span>
            <span v-if="file.lastModified" class="file-item-meta">
              {{ formatDate(file.lastModified) }}
            </span>
            <span
              v-if="file.type === PathTypeEnum.FILE && file.size !== undefined"
              class="file-item-meta"
            >
              {{ formatSize(file.size) }}
            </span>
          </div>
        </div>
        <context-menu
          v-if="contextMenuVisible"
          :position="contextMenuPosition"
          :file="selectedFile"
          @context-menu-action-emit="handleContextMenu"
          @close="closeContextMenu"
        />
        <new-file-dialog ref="newFileDialogRef" />
      </div>
    </ScrollArea>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ContextMenuAction, useFileStore } from '../../../store';
import { useLang } from '../../../lang';
import ContextMenu from './context-menu.vue';
import NewFileDialog from './new-file-dialog.vue';
import { PathInfo, PathTypeEnum } from '../../../datasources';
import prettyBytes from 'pretty-bytes';
import { useMessageService } from '@/composables';
import { ScrollArea } from '@/components/ui/scroll-area';

const router = useRouter();
const message = useMessageService();
const lang = useLang();
const fileStore = useFileStore();
const { deleteFileOrFolder, changeDirectory } = fileStore;
const { sortedFileList } = storeToRefs(fileStore);

const activeRef = ref<PathInfo>();

const SUPPORTED_FILE_EXTENSIONS = ['.search', '.partiql', '.mongo'];

const isSupportedFile = (path: string): boolean =>
  SUPPORTED_FILE_EXTENSIONS.some(ext => path.endsWith(ext));

enum ClickType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
}

const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  return (
    d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
};

const formatSize = (size: number): string => {
  return prettyBytes(size);
};

const handleClick = async (type: ClickType, file: PathInfo) => {
  activeRef.value = file;
  if (type === ClickType.DOUBLE) {
    if (file.type === PathTypeEnum.FOLDER) {
      await changeDirectory(file.path);
    } else {
      if (isSupportedFile(file.path)) {
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

const selectedFile = ref<PathInfo>();
const newFileDialogRef = ref();
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const previousFocus = ref<HTMLElement | null>(null);

const showContextMenu = (event: MouseEvent, file?: PathInfo) => {
  // Prevent the event from propagating further
  event.stopPropagation();
  previousFocus.value = event.currentTarget as HTMLElement;
  activeRef.value = file;
  selectedFile.value = file;
  contextMenuPosition.value = { x: event.layerX, y: event.layerY };
  contextMenuVisible.value = true;
};

const openContextMenuForKeyboard = (event: KeyboardEvent, file: PathInfo) => {
  previousFocus.value = event.currentTarget as HTMLElement;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  contextMenuPosition.value = { x: rect.left, y: rect.bottom };
  selectedFile.value = file;
  contextMenuVisible.value = true;
};

const closeContextMenu = () => {
  contextMenuVisible.value = false;
  if (previousFocus.value) {
    const el = previousFocus.value;
    nextTick(() => {
      el.focus();
    });
    previousFocus.value = null;
  }
};

const handleClickOutside = (event: MouseEvent) => {
  if (!(event.target as HTMLElement).closest('.context-menu')) {
    closeContextMenu();
  }
};

const handleContextMenu = async (action: ContextMenuAction) => {
  closeContextMenu();
  if (action === ContextMenuAction.CONTEXT_MENU_ACTION_OPEN) {
    if (selectedFile.value?.type === PathTypeEnum.FOLDER) {
      await changeDirectory(selectedFile.value?.path);
    } else {
      if (isSupportedFile(selectedFile.value?.path ?? '')) {
        router.push({ name: 'Connect', params: { filePath: selectedFile.value?.path } });
      } else {
        message.error(lang.t('editor.unsupportedFile'), {
          closable: true,
          keepAliveOnHover: true,
          duration: 3600,
        });
      }
    }
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_DELETE) {
    deleteFileOrFolder(selectedFile.value?.path ?? '');
  } else {
    newFileDialogRef.value.showModal(action, selectedFile.value);
  }
};

const getGridColumns = () => {
  const container = document.querySelector('.grid-container');
  if (!container) return 1;
  const gridComputedStyle = window.getComputedStyle(container);
  return gridComputedStyle.getPropertyValue('grid-template-columns').split(' ').length;
};

const focusFileNode = (index: number) => {
  const items = document.querySelectorAll('.file-item');
  if (index >= 0 && index < items.length) {
    (items[index] as HTMLElement)?.focus();
  }
};

const getClass = (file: PathInfo, index: number) => {
  if (activeRef.value === file) {
    return 'file-item file-item-active';
  } else if (index === sortedFileList.value.length - 1) {
    return 'file-item';
  } else {
    return 'file-item file-item-hover';
  }
};

changeDirectory();

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.file-list-container {
  flex: 1;
  height: 0;
  padding-bottom: 10px;
  background-color: hsl(var(--card));
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  padding: 10px;
}

.file-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  border-radius: 8px;
  transition: background-color 0.2s;
}

.file-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
}

.file-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  text-align: center;
}

.file-item-name {
  font-size: 13px;
  word-break: break-word;
  margin-bottom: 4px;
}

.file-item-meta {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}

.file-item-hover:hover {
  background-color: hsl(var(--accent));
}

.file-item-active {
  background-color: hsl(var(--accent));
}
</style>
