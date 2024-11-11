<template>
  <div class="backup-panel-container">
    <n-card title="Source Data">
      <n-form
        ref="fileFormRef"
        label-placement="left"
        label-width="100"
        :model="backupFormData"
        :rules="backupFormRules"
      >
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
                @update:show="(isOpen: boolean) => handleOpen(isOpen, 'index')"
              />
            </n-form-item>
          </n-grid-item>
          <n-gi :span="24">
            <div style="display: flex; justify-content: flex-end">
              <n-button round type="primary"> Validate</n-button>
            </div>
          </n-gi>
        </n-grid>
      </n-form>
    </n-card>
    <div class="backup-action-container">
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-icon size="48">
            <ZoomArea />
          </n-icon>
        </template>
        Validate Config
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-icon size="48">
            <DocumentExport />
          </n-icon>
        </template>
        Execute Backup
      </n-tooltip>
    </div>
    <n-card title="Backup Location">
      <n-form
        ref="fileFormRef"
        label-placement="left"
        label-width="100"
        :model="backupFormData"
        :rules="backupFormRules"
      >
        <n-grid cols="8" item-responsive responsive="screen" x-gap="10" y-gap="10">
          <n-grid-item span="8">
            <n-form-item :label="$t('backup.backupForm.backupFolder')" path="backupFolder">
              <n-button dashed icon-placement="right">
                <template #icon>
                  <n-icon>
                    <FolderDetails />
                  </n-icon>
                </template>
                Select Folder
              </n-button>
            </n-form-item>
          </n-grid-item>
          <n-grid-item span="8">
            <n-form-item :label="$t('backup.backupForm.backupFileName')" path="backupFileName">
              <n-input
                v-model:value="backupFormData.backupFileName"
                clearable
                :input-props="inputProps"
                :placeholder="$t('backup.backupForm.backupFileName')"
              />
            </n-form-item>
          </n-grid-item>
          <n-gi :span="24">
            <div style="display: flex; justify-content: flex-end">
              <n-button round type="primary"> Validate</n-button>
            </div>
          </n-gi>
        </n-grid>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui';
import { DocumentExport, FolderDetails, ZoomArea } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '../../../store';
import { CustomError, inputProps } from '../../../common';
import { useLang } from '../../../lang';

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices } = connectionStore;
const { established, connections, establishedIndexNames } = storeToRefs(connectionStore);

const message = useMessage();
const lang = useLang();

const defaultFormData = {
  connection: '',
  index: '',
  backupFolder: '',
  backupFileName: '',
};
const backupFormData = ref<{
  connection: string;
  index: string;
  backupFolder: string;
  backupFileName: string;
}>(defaultFormData);
const backupFormRules = reactive<FormRules>({
  // @ts-ignore
  connection: [
    {
      required: true,
      renderMessage: () => lang.t('connection.formValidation.nameRequired'),
      trigger: ['input', 'blur'],
    },
  ],
  index: [
    {
      required: true,
      trigger: ['input', 'blur'],
    },
  ],
});
const loadingRefs = ref<{ connection: boolean; index: boolean }>({
  connection: false,
  index: false,
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const indexOptions = computed(() =>
  establishedIndexNames.value.map(name => ({ label: name, value: name })),
);

const handleOpen = async (isOpen: boolean, target: string) => {
  if (!isOpen) return;
  if (!established.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }
  if (target === 'connection') {
    loadingRefs.value.connection = true;
    await fetchConnections();
    loadingRefs.value.connection = false;
  } else if (target === 'index') {
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
