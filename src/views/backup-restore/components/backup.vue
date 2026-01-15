<template>
  <div class="backup-panel-container">
    <n-form
      ref="fileFormRef"
      label-placement="left"
      label-width="100"
      :model="backupFormData"
      :rules="backupFormRules"
      style="width: 100%"
    >
      <div class="backup-form-container">
        <n-card title="Source Data">
          <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
            <n-grid-item span="8">
              <n-form-item :label="$t('backup.backupForm.connection')" path="connection">
                <n-select
                  :options="filteredConnectionOptions"
                  :placeholder="$t('connection.selectConnection')"
                  v-model:value="backupFormData.connection"
                  :default-value="connection?.name"
                  :loading="loadingRefs.connection"
                  :input-props="inputProps"
                  remote
                  filterable
                  @update:value="(value: string) => handleSelectUpdate(value, 'connection')"
                  @update:show="(isOpen: boolean) => handleOpen(isOpen, 'connection')"
                  @search="handleConnectionSearch"
                />
              </n-form-item>
            </n-grid-item>
            <n-grid-item span="8">
              <n-form-item :label="$t('backup.backupForm.index')" path="index">
                <n-select
                  :options="filteredIndexOptions"
                  :placeholder="$t('connection.selectIndex')"
                  v-model:value="backupFormData.index"
                  :input-props="inputProps"
                  remote
                  filterable
                  :loading="loadingRefs.index"
                  @update:value="(value: string) => handleSelectUpdate(value, 'index')"
                  @update:show="(isOpen: boolean) => handleOpen(isOpen, 'index')"
                  @search="handleIndexSearch"
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
                      { label: '.json', value: 'json' },
                      { label: '.csv', value: 'csv' },
                    ]"
                  />
                </n-input-group>
              </n-form-item>
            </n-grid-item>
          </n-grid>
        </n-card>
      </div>
      <n-progress
        type="line"
        v-if="backupProgressPercents"
        :percentage="backupProgressPercents ?? 0"
        indicator-placement="inside"
        :processing="backupProgressPercents < 100"
        class="backup-progress-bar"
      />
    </n-form>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { DocumentExport, FolderDetails, ZoomArea } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import {
  BackupInput,
  ElasticsearchConnection,
  useBackupRestoreStore,
  useConnectionStore,
} from '../../../store';
import { CustomError, inputProps } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const dialog = useDialog();
const lang = useLang();

const fileFormRef = ref();
const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, selectIndex, freshConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const backupRestoreStore = useBackupRestoreStore();
const { selectFolder, backupToFile, checkFileExist } = backupRestoreStore;
const { folderPath, backupProgress, connection } = storeToRefs(backupRestoreStore);

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
    {
      validator: (_rule: any, value: string) => {
        if (!value) return true;
        const hasExtension = /\.(json|csv|txt|[a-z]{2,4})$/i.test(value);
        if (hasExtension) {
          return new Error(lang.t('backup.backupForm.backupFileNameNoExtension'));
        }
        return true;
      },
      trigger: ['input', 'blur'],
    },
  ],
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const connectionSearchQuery = ref('');
const filteredConnectionOptions = computed(() => {
  if (!connectionSearchQuery.value) {
    return connectionOptions.value;
  }
  const query = connectionSearchQuery.value.toLowerCase();
  return connectionOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const handleConnectionSearch = (query: string) => {
  connectionSearchQuery.value = query;
};

const backupProgressPercents = computed(() => {
  if (!backupProgress.value) return null;
  const percents = parseFloat(
    ((backupProgress.value.complete / backupProgress.value.total) * 100).toFixed(2),
  );
  return isNaN(percents) ? null : percents;
});

const indexOptions = ref<Array<{ label: string; value: string }>>([]);
const indexSearchQuery = ref('');
const filteredIndexOptions = computed(() => {
  if (!indexSearchQuery.value) {
    return indexOptions.value;
  }
  const query = indexSearchQuery.value.toLowerCase();
  return indexOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const handleIndexSearch = (query: string) => {
  indexSearchQuery.value = query;
};

watch(connection, () => {
  if (!connection.value) {
    indexOptions.value = [];
    backupFormData.value.index = '';
    indexSearchQuery.value = '';
    return;
  }
  indexOptions.value =
    (connection.value as ElasticsearchConnection)?.indices?.map(index => ({
      label: index.index,
      value: index.index,
    })) ?? [];
});

watch(folderPath, () => {
  backupFormData.value.backupFolder = folderPath.value;
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
    if (!connection.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    loadingRefs.value.index = true;
    try {
      await fetchIndices(connection.value);
      // Update indexOptions after fetching indices
      indexOptions.value =
        (connection.value as ElasticsearchConnection)?.indices?.map(index => ({
          label: index.index,
          value: index.index,
        })) ?? [];
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
    const con = connections.value.find(({ name }) => name === value);
    if (!con) {
      return;
    }
    try {
      connection.value = con;
      await freshConnection(connection.value);
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 3600,
      });
    }
  } else if (target === 'index') {
    if (!connection.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    selectIndex(connection.value, value);
  }
};

const handleValidate = () => {
  fileFormRef.value?.validate((errors: boolean) =>
    errors
      ? message.error(lang.t('backup.backupForm.validationFailed'))
      : message.success(lang.t('connection.validationPassed')),
  );
};
const saveBackup = async (backupInput: BackupInput) => {
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

  const connection = connections.value.find(({ name }) => name === backupFormData.value.connection);
  if (!isPass || !connection) return;
  const backupInput = { ...backupFormData.value, connection };
  try {
    const isExist = await checkFileExist(backupFormData.value);
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

watch(backupFormData, () => (backupProgress.value = null), { deep: true });
</script>

<style lang="scss" scoped>
.backup-panel-container {
  margin: 10px 20px;

  .backup-form-container {
    display: flex;
    justify-content: space-around;

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

  .backup-progress-bar {
    margin-top: 20px;
  }
}
</style>
