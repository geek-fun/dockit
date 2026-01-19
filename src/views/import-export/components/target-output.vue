<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DocumentExport />
        </n-icon>
        <span class="step-title">{{ $t('export.targetOutput') }}</span>
      </div>
    </template>
    <template #header-extra>
      <span class="step-badge">{{ $t('export.step') }} 03</span>
    </template>

    <n-grid cols="2" x-gap="16" y-gap="16">
      <n-grid-item span="2">
        <div class="field-label">{{ $t('export.fileType') }}</div>
        <n-space>
          <n-button
            v-for="type in fileTypeOptions"
            :key="type.value"
            :type="selectedFileType === type.value ? 'primary' : 'default'"
            @click="handleFileTypeChange(type.value)"
          >
            {{ type.label }}
          </n-button>
        </n-space>
      </n-grid-item>

      <n-grid-item span="2">
        <div class="field-label">{{ $t('export.filename') }}</div>
        <n-input
          v-model:value="fileName"
          :placeholder="$t('export.filenamePlaceholder')"
          @update:value="handleFileNameChange"
        >
          <template #suffix>
            <span class="file-extension">.{{ selectedFileType }}</span>
          </template>
        </n-input>
      </n-grid-item>

      <n-grid-item span="2">
        <div class="field-label">{{ $t('export.destinationPath') }}</div>
        <n-input-group>
          <n-button @click="handleSelectFolder">
            <template #icon>
              <n-icon>
                <FolderOpen />
              </n-icon>
            </template>
            {{ folderPath ? '' : $t('export.selectFolder') }}
          </n-button>
          <n-input
            v-if="folderPath"
            :value="folderPath"
            readonly
            :placeholder="$t('export.selectFolderPlaceholder')"
          />
        </n-input-group>
      </n-grid-item>
    </n-grid>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { DocumentExport, FolderOpen } from '@vicons/carbon';
import { useImportExportStore, FileType } from '../../../store';
import { CustomError } from '../../../common';

const message = useMessage();

const exportStore = useImportExportStore();
const { folderPath, fileName, fileType } = storeToRefs(exportStore);

const selectedFileType = ref<FileType>(fileType.value || 'ndjson');

const fileTypeOptions = [
  { label: 'NDJSON', value: 'ndjson' as FileType },
  { label: 'CSV', value: 'csv' as FileType },
];

// Initialize values from store
onMounted(() => {
  if (fileType.value) {
    selectedFileType.value = fileType.value;
  }
});

const handleFileTypeChange = (type: FileType) => {
  selectedFileType.value = type;
  exportStore.setFileType(type);
};

const handleFileNameChange = (value: string) => {
  exportStore.setFileName(value);
};

const handleSelectFolder = async () => {
  try {
    await exportStore.selectFolder();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

// Sync with store
watch(fileType, newType => {
  if (newType) {
    selectedFileType.value = newType;
  }
});
</script>

<style lang="scss" scoped>
.step-card {
  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .step-title {
      font-size: 16px;
      font-weight: 600;
    }
  }

  .step-badge {
    font-size: 12px;
    color: var(--text-color-3);
    font-weight: 500;
  }

  .field-label {
    font-size: 12px;
    color: var(--text-color-3);
    margin-bottom: 8px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .file-extension {
    color: var(--text-color-3);
    font-size: 13px;
  }
}
</style>
