<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>{{ modalTitle }}</DialogTitle>
      </DialogHeader>
      <div class="modal-content">
        <Form>
          <FormItem :label="$t('file.name')" required>
            <Input
              v-model="formData.path"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
              :placeholder="$t('file.name')"
            />
          </FormItem>
        </Form>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ $t('dialogOps.cancel') }}</Button>
        <Button :disabled="!validationPassed || saveLoading" @click="submitNewFile">
          <Loader2 v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin" />
          {{ $t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { useMessageService } from '@/composables';
import { cloneDeep } from 'lodash';
import { useLang } from '../../../lang';
import { ContextMenuAction, ToolBarAction, useFileStore } from '../../../store';
import { CustomError } from '../../../common';
import { PathInfo } from '../../../datasources';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormItem } from '@/components/ui/form';

const lang = useLang();
const fileStore = useFileStore();
const { createFileOrFolder, renameFileOrFolder } = fileStore;

const showModal = ref(false);
const modalTitle = ref('');
const saveLoading = ref(false);
const selectedFileRef = ref<PathInfo>();

const defaultFormData = { path: '' };
const formData = ref<{ path: string }>(cloneDeep(defaultFormData));

const message = useMessageService();

const cleanUp = () => {
  formData.value = cloneDeep(defaultFormData);
  modalTitle.value = '';
};

const openModal = (action: ContextMenuAction, selectedFile?: PathInfo) => {
  cleanUp();
  selectedFileRef.value = selectedFile;
  if (action === ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FOLDER) {
    modalTitle.value = lang.t('file.newFolder');
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_NEW_FILE) {
    modalTitle.value = lang.t('file.newFile');
  } else if (action === ContextMenuAction.CONTEXT_MENU_ACTION_RENAME) {
    modalTitle.value = lang.t('file.rename');
    formData.value.path = selectedFile?.name ?? '';
  }
  showModal.value = true;
};

const closeModal = () => {
  cleanUp();
  showModal.value = false;
};

const validationPassed = computed(() => {
  return formData.value.path.trim().length > 0;
});

const submitNewFile = async (event: MouseEvent) => {
  event.preventDefault();
  if (!validationPassed.value) {
    message.error(lang.t('file.newFileFailed'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
    return;
  }

  try {
    saveLoading.value = true;
    if (modalTitle.value === lang.t('file.newFile')) {
      await createFileOrFolder(ToolBarAction.ADD_DOCUMENT, formData.value.path);
    } else if (modalTitle.value === lang.t('file.newFolder')) {
      await createFileOrFolder(ToolBarAction.ADD_FOLDER, formData.value.path);
    } else if (modalTitle.value === lang.t('file.rename')) {
      const folderPath = selectedFileRef.value?.path.substring(
        0,
        selectedFileRef.value?.path.lastIndexOf('/'),
      );
      await renameFileOrFolder(
        selectedFileRef.value?.path ?? '',
        `${folderPath}/${formData.value.path}`,
      );
    }
  } catch (e) {
    message.error(`status: ${(e as CustomError).status}, details: ${(e as CustomError).details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    saveLoading.value = false;
    closeModal();
  }
};

defineExpose({ showModal: openModal });
</script>

<style scoped>
.modal-content {
  padding: 1rem 0;
}
</style>
