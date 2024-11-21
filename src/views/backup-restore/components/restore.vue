<template>
  <div class="restore-panel-container">
    <n-form
      ref="fileFormRef"
      label-placement="left"
      label-width="100"
      :model="restoreFormData"
      :rules="restoreFormRules"
      style="width: 100%"
    >
      <div class="restore-form-container">
        <n-card title="source">
          <div class="file-upload-zone" @click="handleFileUpload">
            <div style="margin-bottom: 12px">
              <n-icon size="48" :depth="3">
                <FileStorage />
              </n-icon>
            </div>
            <n-text style="font-size: 16px">
              {{ $t('backup.restoreSourceDesc') }}
            </n-text>
          </div>
          <div v-if="restoreFormData.restoreFile" class="restore-file-display">
            <p>{{ restoreFormData.restoreFile }}</p>

            <n-icon
              size="28"
              class="clear-button"
              @click="(() => (restoreFormData.restoreFile = ''))()"
            >
              <Close />
            </n-icon>
          </div>
        </n-card>
        <div class="restore-action-container">
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-icon size="48" @click="handleValidate">
                <ZoomArea />
              </n-icon>
            </template>
            Validate Config
          </n-tooltip>
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-icon size="48" @click="submitBackup">
                <DocumentExport />
              </n-icon>
            </template>
            Execute Restore
          </n-tooltip>
        </div>

        <n-card title="target">
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('backup.backupForm.connection')" path="connection">
                <n-select
                  :options="connectionOptions"
                  :placeholder="$t('connection.selectConnection')"
                  v-model:value="restoreFormData.connection"
                  :default-value="established?.name"
                  :loading="loadingRefs.connection"
                  remote
                  filterable
                  @update:value="(value: string) => handleSelectUpdate(value, 'connection')"
                  @update:show="(isOpen: boolean) => handleOpen(isOpen, 'connection')"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('backup.backupForm.index')" path="index">
                <n-input
                  v-model:value="restoreFormData.index"
                  type="text"
                  :placeholder="$t('connection.selectIndex')"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-card>
      </div>
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { DocumentExport, FileStorage, ZoomArea, Close } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { typeBackupInput, useBackupRestoreStore, useConnectionStore } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const dialog = useDialog();
const lang = useLang();

const fileFormRef = ref();
const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, establishConnection, selectIndex } = connectionStore;
const { established, connections } = storeToRefs(connectionStore);

const backupRestoreStore = useBackupRestoreStore();
const { backupToFile, checkFileExist, selectFile } = backupRestoreStore;
const { backupProgress, restoreFile } = storeToRefs(backupRestoreStore);

const defaultFormData = {
  connection: '',
  index: '',
  restoreFile: '',
};

const restoreFormData = ref<{
  connection: string;
  index: string;
  restoreFile: string;
}>(defaultFormData);

const restoreFormRules = reactive<FormRules>({
  // @ts-ignore
  connection: [
    {
      required: true,
      renderMessage: () => lang.t('backup.backupForm.connectionRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  index: [
    {
      required: true,
      renderMessage: () => lang.t('backup.backupForm.indexRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  restoreFile: [
    {
      required: true,
      renderMessage: () => lang.t('backup.backupForm.backupFolderRequired'),
      trigger: ['input', 'blur'],
    },
  ],
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const backupProgressPercents = computed(() => {
  if (!backupProgress.value) return null;
  const percents = parseFloat(
    ((backupProgress.value.complete / backupProgress.value.total) * 100).toFixed(2),
  );
  return isNaN(percents) ? null : percents;
});

const handleFileUpload = async () => {
  try {
    await selectFile();
    restoreFormData.value.restoreFile = restoreFile.value;
    console.log('handleFileUpload', restoreFormData.value);
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};

const indexOptions = ref<Array<{ label: string; value: string }>>([]);
watch(established, () => {
  if (!established.value) {
    indexOptions.value = [];
    restoreFormData.value.index = '';
    return;
  }
  indexOptions.value =
    established.value?.indices.map(({ index }) => ({ label: index, value: index })) ?? [];
});

const loadingRefs = ref<{ connection: boolean; index: boolean }>({
  connection: false,
  index: false,
});

const handleOpen = async (isOpen: boolean, target: string) => {
  if (!isOpen) return;
  if (target === 'connection') {
    loadingRefs.value.connection = true;
    await fetchConnections();
    loadingRefs.value.connection = false;
  } else if (target === 'index') {
    if (!established.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    loadingRefs.value.index = true;
    try {
      await fetchIndices();
    } catch (err) {
      message.error(
        `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
        {
          closable: true,
          keepAliveOnHover: true,
          duration: 3000,
        },
      );
    }
    loadingRefs.value.index = false;
  }
};

const handleSelectUpdate = async (value: string, target: string) => {
  if (target === 'connection') {
    const connection = connections.value.find(({ name }) => name === value);
    if (!connection) {
      return;
    }
    try {
      await establishConnection(connection);
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 3600,
      });
    }
  } else if (target === 'index') {
    selectIndex(value);
  }
};

const handleValidate = () => {
  fileFormRef.value?.validate((errors: boolean) =>
    errors
      ? message.error(lang.t('backup.backupForm.validationFailed'))
      : message.success(lang.t('connection.validationPassed')),
  );
};
const saveBackup = async (backupInput: typeBackupInput) => {
  try {
    const filePath = await backupToFile(backupInput);
    message.success(lang.t('backup.backupToFileSuccess') + `: ${filePath}`);
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};
const submitBackup = async () => {
  const isPass = fileFormRef.value?.validate((errors: boolean) => {
    if (errors) {
      message.error(lang.t('backup.backupForm.validationFailed'));
      return false;
    }
    return true;
  });

  const connection = connections.value.find(
    ({ name }) => name === restoreFormData.value.connection,
  );
  if (!isPass || !connection) return;
  const backupInput = { ...restoreFormData.value, connection };
  try {
    const isExist = await checkFileExist(restoreFormData.value);
    if (!isExist) {
      await saveBackup(backupInput);
      return;
    }

    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('dialogOps.overwriteFile'),
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        saveBackup(backupInput).catch(err => {
          const error = err as CustomError;
          message.error(`status: ${error.status}, details: ${error.details}`, {
            closable: true,
            keepAliveOnHover: true,
            duration: 3600,
          });
        });
      },
      onNegativeClick: () => {},
    });
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};

watch(restoreFormData, () => (backupProgress.value = null), { deep: true });
</script>

<style lang="scss" scoped>
.restore-panel-container {
  margin: 10px 20px;

  .restore-form-container {
    display: flex;
    justify-content: space-around;

    .restore-action-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      margin: 10px;

      & > i {
        cursor: pointer;
        margin: 10px 5px;

        &:hover {
          color: var(--theme-color-hover);
        }
      }
    }

    .file-upload-zone {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      margin: 20px;
      padding: 20px;
      border: 1px dashed var(--border-color);
      border-radius: 5px;
      cursor: pointer;
      transition: border-color 0.3s;
      background-color: var(--card-bg-color);

      &:hover {
        border-color: var(--theme-color-hover);
      }
    }
  }

  .restore-file-display {
    display: flex;
    justify-content: space-between;

    &:hover {
      border-radius: 5px;
      border: 1px solid var(--border-color);
      background-color: var(--theme-color-hover);
      opacity: 0.7;

      .clear-button {
        display: block;
        &:hover {
          opacity: 1;
        }
      }
    }
  }

  .clear-button {
    display: none;
    border: none;
    padding: 5px 10px;
    cursor: pointer;
    border-radius: 3px;
    opacity: 0.8;
    align-self: center;
  }

  .backup-progress-bar {
    margin-top: 20px;
  }
}
</style>
