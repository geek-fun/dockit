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
              <n-icon size="48" @click="submitRestore">
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
                  :default-value="connection?.name"
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
                  :input-props="inputProps"
                  :placeholder="$t('backup.backupForm.index')"
                />
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-card>
      </div>
      <n-progress
        type="line"
        v-if="restoreProgressPercents"
        :percentage="restoreProgressPercents ?? 0"
        indicator-placement="inside"
        :processing="restoreProgressPercents < 100"
        class="backup-progress-bar"
      />
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { Close, DocumentExport, FileStorage, ZoomArea } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { ElasticsearchConnection, useBackupRestoreStore, useConnectionStore } from '../../../store';
import { CustomError, inputProps } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const dialog = useDialog();
const lang = useLang();

const fileFormRef = ref();
const connectionStore = useConnectionStore();
const { fetchConnections, testConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const backupRestoreStore = useBackupRestoreStore();
const { selectFile, restoreFromFile } = backupRestoreStore;
const { restoreProgress, restoreFile, connection } = storeToRefs(backupRestoreStore);

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

const restoreProgressPercents = computed(() => {
  if (!restoreProgress.value) return null;
  const percents = parseFloat(
    ((restoreProgress.value.complete / restoreProgress.value.total) * 100).toFixed(2),
  );
  return isNaN(percents) ? null : percents;
});

const handleFileUpload = async () => {
  try {
    await selectFile();
    restoreFormData.value.restoreFile = restoreFile.value;
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  }
};

const loadingRefs = ref<{ connection: boolean }>({ connection: false });

const handleOpen = async (isOpen: boolean, target: string) => {
  if (!isOpen) return;
  if (target === 'connection') {
    loadingRefs.value.connection = true;
    await fetchConnections();
    loadingRefs.value.connection = false;
  }
};

const handleSelectUpdate = async (value: string, target: string) => {
  if (target === 'connection') {
    const con = connections.value.find(({ name }) => name === value);
    if (!con) {
      return;
    }
    try {
      await testConnection(con);
      connection.value = con;
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 3600,
      });
    }
  }
};

const handleValidate = () => {
  fileFormRef.value?.validate((errors: boolean) =>
    errors
      ? message.error(lang.t('backup.backupForm.validationFailed'))
      : message.success(lang.t('connection.validationPassed')),
  );
};

const submitRestore = async () => {
  const isPass = fileFormRef.value?.validate((errors: boolean) => {
    if (errors) {
      message.error(lang.t('backup.backupForm.validationFailed'));
      return false;
    }
    return true;
  });

  const con = connections.value.find(({ name }) => name === restoreFormData.value.connection);

  if (!isPass || !con) return;

  const restoreInput = { ...restoreFormData.value, connection: con };

  const index = (connection.value as ElasticsearchConnection)?.indices.find(
    index => (index as { index: string }).index === restoreFormData.value.index,
  );

  if (!index) {
    try {
      await restoreFromFile(restoreInput);
      message.success(lang.t('backup.restoreFromFileSuccess'));
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 3600,
      });
    }
    return;
  }

  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('dialogOps.overwriteIndex'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      restoreFromFile(restoreInput)
        .then(() => message.success(lang.t('backup.restoreFromFileSuccess')))
        .catch(err => {
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
};

watch(restoreFormData, () => (restoreProgress.value = null), { deep: true });
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
