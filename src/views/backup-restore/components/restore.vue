<template>
  <div>
    <div class="backup-panel-container">
      <n-card title="source">
        <n-upload
          multiple
          directory-dnd
          action="https://www.mocky.io/v2/5e4bafc63100007100d8b70f"
          :max="5"
        >
          <n-upload-dragger>
            <div style="margin-bottom: 12px">
              <n-icon size="48" :depth="3">
                <FileStorage />
              </n-icon>
            </div>
            <n-text style="font-size: 16px">
              {{ $t('backup.restoreSourceDesc') }}
            </n-text>
          </n-upload-dragger>
        </n-upload>
      </n-card>
      <n-icon size="48">
        <DocumentExport />
      </n-icon>
      <n-card title="target"></n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { DocumentExport, FileStorage } from '@vicons/carbon';
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
const { selectFolder, backupToFile, checkFileExist } = backupRestoreStore;
const { folderPath, backupProgress } = storeToRefs(backupRestoreStore);

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
