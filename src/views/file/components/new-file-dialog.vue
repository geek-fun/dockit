<template>
  <n-modal v-model:show="showModal">
    <n-card
      style="width: 600px"
      role="dialog"
      aria-modal="true"
      :title="modalTitle"
      :bordered="false"
      class="new-file-modal-card"
      @mask-click="closeModal"
    >
      <template #header-extra>
        <n-icon size="26" @click="closeModal">
          <Close />
        </n-icon>
      </template>
      <div class="modal-content">
        <n-form
          ref="fileFormRef"
          label-placement="left"
          label-width="100"
          :model="formData"
          :rules="formRules"
        >
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('file.name')" path="path">
                <n-input
                  v-model:value="formData.path"
                  clearable
                  :input-props="{
                    autocapitalize: 'off',
                    autocomplete: 'off',
                    // @ts-ignore
                    spellCheck: false,
                    autocorrect: 'off',
                  }"
                  :placeholder="$t('file.name')"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-form>
      </div>
      <template #footer>
        <div class="card-footer">
          <n-button @click="closeModal">{{ $t('dialogOps.cancel') }}</n-button>
          <n-button
            type="primary"
            :loading="saveLoading"
            :disabled="!validationPassed"
            @click="submitNewFile"
          >
            {{ $t('dialogOps.confirm') }}
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { Close } from '@vicons/carbon';
import { useLang } from '../../../lang';
import { FormRules, FormValidationError } from 'naive-ui';
import { ContextMenuAction, FileItem, ToolBarAction, useFileStore } from '../../../store';
import { CustomError } from '../../../common';

const lang = useLang();
const fileStore = useFileStore();
const { createFileOrFolder, renameFileOrFolder } = fileStore;

const fileFormRef = ref();
const showModal = ref(false);
const modalTitle = ref('');
const saveLoading = ref(false);
const selectedFileRef = ref<FileItem>();

const defaultFormData = { path: '' };
const formData = ref<{ path: string }>(defaultFormData);
const formRules = reactive<FormRules>({
  // @ts-ignore
  path: [
    {
      required: true,
      renderMessage: () => lang.t('connection.formValidation.nameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});

const message = useMessage();

const cleanUp = () => {
  formData.value = defaultFormData;
  modalTitle.value = '';
};

const showMedal = (action: ContextMenuAction, selectedFile?: FileItem) => {
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

const validationPassed = watch(formData.value, async () => {
  try {
    return await fileFormRef.value?.validate((errors: Array<FormValidationError>) => !errors);
  } catch (e) {
    return false;
  }
});

const submitNewFile = (event: MouseEvent) => {
  event.preventDefault();
  fileFormRef.value?.validate(async (errors: boolean) => {
    try {
      if (!errors) {
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
      } else {
        message.error(lang.t('file.newFileFailed'), {
          closable: true,
          keepAliveOnHover: true,
          duration: 3600,
        });
      }
    } catch (e) {
      message.error(
        `status: ${(e as CustomError).status}, details: ${(e as CustomError).details}`,
        {
          closable: true,
          keepAliveOnHover: true,
          duration: 3600,
        },
      );
    } finally {
      saveLoading.value = false;
      closeModal();
    }
  });
};

defineExpose({ showModal: showMedal });
</script>
<style lang="scss">
.new-file-modal-card {
  .n-card-header {
    .n-card-header__extra {
      cursor: pointer;
    }
  }

  .n-card__footer {
    .card-footer {
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;

      .n-button + .n-button {
        margin-left: 10px;
      }
    }
  }
}
</style>
