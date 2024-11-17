<template>
  <n-form
    ref="fileFormRef"
    label-placement="left"
    label-width="100"
    :model="backupFormData"
    :rules="backupFormRules"
  >
    <div class="backup-panel-container">
      <n-card title="Source Data">
        <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
          <n-grid-item span="8">
            <n-form-item :label="$t('backup.backupForm.connection')" path="connection">
              <n-select
                :options="connectionOptions"
                :placeholder="$t('connection.selectConnection')"
                v-model:value="backupFormData.connection"
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
              <n-select
                :options="indexOptions"
                :placeholder="$t('connection.selectIndex')"
                v-model:value="backupFormData.index"
                remote
                filterable
                :loading="loadingRefs.index"
                @update:value="(value: string) => handleSelectUpdate(value, 'index')"
                @update:show="(isOpen: boolean) => handleOpen(isOpen, 'index')"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </n-card>
      <div class="backup-action-container">
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
          Execute Backup
        </n-tooltip>
      </div>
      <n-card title="Backup Location">
        <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
          <n-grid-item span="8">
            <n-form-item :label="$t('backup.backupForm.backupFolder')" path="backupFolder">
              <div>
                <n-button dashed icon-placement="right" @click="selectFolder">
                  <template #icon>
                    <n-icon>
                      <FolderDetails />
                    </n-icon>
                  </template>
                  Select Folder
                </n-button>
                <n-p v-if="folderPath">{{ folderPath }}</n-p>
              </div>
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="8">
            <n-form-item :label="$t('backup.backupForm.backupFileName')" path="backupFileName">
              <n-input-group>
                <n-input
                  v-model:value="backupFormData.backupFileName"
                  clearable
                  :input-props="inputProps"
                  :placeholder="$t('backup.backupForm.backupFileName')"
                  :style="{ width: '70%' }"
                />
                <n-select
                  :style="{ width: '30%' }"
                  v-model:value="backupFormData.backupFileType"
                  :options="[
                    { label: 'json', value: 'json' },
                    { label: 'csv', value: 'csv' },
                  ]"
                />
              </n-input-group>
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </n-card>
    </div>
  </n-form>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { DocumentExport, FolderDetails, ZoomArea } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { useBackupRestoreStore, useConnectionStore } from '../../../store';
import { CustomError, inputProps } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const lang = useLang();
const fileFormRef = ref();
const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, establishConnection, selectIndex } = connectionStore;
const { established, connections } = storeToRefs(connectionStore);

const backupRestoreStore = useBackupRestoreStore();
const { selectFolder, backupToFile } = backupRestoreStore;
const { folderPath } = storeToRefs(backupRestoreStore);

const defaultFormData = {
  connection: '',
  index: '',
  backupFolder: folderPath.value,
  backupFileName: '',
  backupFileType: 'json',
};
const backupFormData = ref<{
  connection: string;
  index: string;
  backupFolder: string;
  backupFileName: string;
  backupFileType: string;
}>(defaultFormData);
const backupFormRules = reactive<FormRules>({
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
  backupFolder: [
    {
      required: true,
      renderMessage: () => lang.t('backup.backupForm.backupFolderRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  backupFileName: [
    {
      required: true,
      renderMessage: () => lang.t('backup.backupForm.backupFileNameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  // backupFileType: [
  //   {
  //     required: true,
  //     validator: (_, value) => ['csv', 'json'].includes(value),
  //     renderMessage: () => lang.t('backup.backupForm.backupFileTypeRequired'),
  //     trigger: ['input', 'blur'],
  //   },
  // ],
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const indexOptions = ref<Array<{ label: string; value: string }>>([]);
watch(established, () => {
  if (!established.value) {
    indexOptions.value = [];
    backupFormData.value.index = '';
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
  console.log('validate', backupFormData.value);
  fileFormRef.value?.validate((errors: boolean) =>
    errors
      ? message.error(lang.t('backup.backupForm.validationFailed'))
      : message.success(lang.t('connection.validationPassed')),
  );
};

const submitBackup = async () => {
  console.log('submitBackup start');
  const isPass = fileFormRef.value?.validate((errors: boolean) => {
    if (errors) {
      message.error(lang.t('backup.backupForm.validationFailed'));
      return false;
    }
    return true;
  });

  console.log('submitBackup', isPass);
  const connection = connections.value.find(({ name }) => name === backupFormData.value.connection);
  if (!isPass || !connection) return;
  try {
    const filePath = await backupToFile({ ...backupFormData.value, connection });
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
</script>

<style lang="scss" scoped>
.backup-panel-container {
  display: flex;
  justify-content: space-around;
  margin: 10px 20px;

  .backup-action-container {
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
}
</style>
