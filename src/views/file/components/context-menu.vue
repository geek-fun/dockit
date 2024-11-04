<template>
  <div class="context-menu" :style="{ top: `${position?.y}px`, left: `${position?.x}px` }">
    <ul>
      <li v-for="action in actions" @click="handleAction(action.action)">{{ action.label }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { FileType, useSourceFileStore } from '../../../store';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';

const props = defineProps({
  position: Object,
  file: Object,
});

const router = useRouter();
const lang = useLang();
const message = useMessage();

const fileStore = useSourceFileStore();
const { openFolder, deleteFileOrFolder } = fileStore;

const newFileDialogRef = ref();

enum Action {
  OPEN = 'OPEN',
  RENAME = 'RENAME',
  DELETE = 'DELETE',
  NEW_FILE = 'NEW_FILE',
  NEW_FOLDER = 'NEW_FOLDER',
}

const actions = ref<Array<{ label: string; action: Action }>>([]);

watchEffect(() => {
  if (props.file) {
    actions.value = [
      { label: lang.t('file.contextMenu.open'), action: Action.OPEN },
      { label: lang.t('file.contextMenu.rename'), action: Action.RENAME },
      { label: lang.t('file.contextMenu.delete'), action: Action.DELETE },
    ];
  } else {
    actions.value = [
      { label: lang.t('file.newFile'), action: Action.NEW_FILE },
      { label: lang.t('file.newFolder'), action: Action.NEW_FOLDER },
    ];
  }
});

const emits = defineEmits(['close-context-menu']);

const handleAction = async (action: Action) => {
  try {
    if (action === Action.OPEN) {
      if (props.file?.type === FileType.FOLDER) {
        await openFolder(props.file?.path);
      } else {
        if (props.file?.path.endsWith('.search')) {
          router.push({ name: 'Connect', params: { filePath: props.file?.path } });
        } else {
          message.error(lang.t('editor.unsupportedFile'), {
            closable: true,
            keepAliveOnHover: true,
            duration: 3600,
          });
        }
      }
    } else if (action === Action.RENAME) {
      // await renameFileOrFolder(props.file?.path);
    } else if (action === Action.DELETE) {
      await deleteFileOrFolder(props.file?.path);
    } else if (action === Action.NEW_FILE) {
      newFileDialogRef.value.showModal(FileType.FILE);
    } else if (action === Action.NEW_FOLDER) {
      newFileDialogRef.value.showModal(FileType.FOLDER);
    }
  } catch (error) {
    message.error(
      `status: ${(error as CustomError).status}, details: ${(error as CustomError).details}`,
      {
        closable: true,
        keepAliveOnHover: true,
        duration: 3600,
      },
    );
  } finally {
    emits('close-context-menu');
  }
};
</script>

<style scoped>
.context-menu {
  position: absolute;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
  z-index: 1000;

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    min-width: 150px;

    li {
      padding: 8px 12px;
      cursor: pointer;

      &:hover {
        background: var(--border-color);
      }
    }
  }
}
</style>
