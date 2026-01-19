<template>
  <n-card class="execution-card">
    <template #header>
      <div class="execution-header">
        <n-icon size="20" color="#f0a020">
          <Flash />
        </n-icon>
        <span class="execution-title">{{ $t('export.execution') }}</span>
      </div>
    </template>

    <!-- Validation Readiness -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">{{ $t('export.validationReadiness') }}</span>
        <span :class="['validation-status', validationClass]">
          {{ validationPercentage }}% {{ $t('export.pass') }}
        </span>
      </div>
      <n-progress
        type="line"
        :percentage="validationPercentage"
        :status="validationPercentage === 100 ? 'success' : 'warning'"
        :show-indicator="false"
      />
    </div>

    <!-- Export Stats -->
    <div class="section stats-section">
      <div class="stat-row">
        <span class="stat-label">{{ $t('export.rowsToExport') }}</span>
        <span class="stat-value">{{ formatNumber(estimatedRows) }}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">{{ $t('export.estimatedDuration') }}</span>
        <span class="stat-value">{{ estimatedDuration }}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">{{ $t('export.estimatedSize') }}</span>
        <span class="stat-value">{{ estimatedSize || '-' }}</span>
      </div>
    </div>

    <!-- File Handling Options -->
    <div class="section">
      <div class="section-title-small">{{ $t('export.fileHandling') }}</div>

      <div class="option-row">
        <n-checkbox v-model:checked="overwriteExisting">
          <div class="option-content">
            <span class="option-label">{{ $t('export.overwriteExisting') }}</span>
            <span class="option-desc">{{ $t('export.overwriteExistingDesc') }}</span>
          </div>
        </n-checkbox>
      </div>

      <div class="option-row">
        <n-checkbox v-model:checked="createDirectory">
          <div class="option-content">
            <span class="option-label">{{ $t('export.createDirectory') }}</span>
            <span class="option-desc">{{ $t('export.createDirectoryDesc') }}</span>
          </div>
        </n-checkbox>
      </div>

      <div class="option-row">
        <div class="option-content-row">
          <span class="option-label">{{ $t('export.beautifyJson') }}</span>
          <n-switch v-model:value="beautifyJson" />
        </div>
      </div>
    </div>

    <!-- Export Button -->
    <div class="export-action">
      <n-button
        type="primary"
        size="large"
        block
        :disabled="!canStartExport"
        :loading="isExporting"
        @click="handleStartExport"
      >
        <template #icon>
          <n-icon>
            <Download />
          </n-icon>
        </template>
        {{ $t('export.startExportTask') }}
      </n-button>
      <p class="export-note">{{ $t('export.exportNote') }}</p>
    </div>

    <!-- Progress Display -->
    <div v-if="exportProgress" class="progress-section">
      <n-progress
        type="line"
        :percentage="progressPercentage"
        :status="progressPercentage === 100 ? 'success' : 'info'"
        indicator-placement="inside"
        :processing="progressPercentage < 100"
      />
      <p class="progress-text">
        {{ exportProgress.complete }} / {{ exportProgress.total }} {{ $t('export.documents') }}
      </p>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Flash, Download } from '@vicons/carbon';
import { useExportStore, ExportInput } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { ulid } from 'ulidx';

const message = useMessage();
const dialog = useDialog();
const lang = useLang();

const exportStore = useExportStore();
const {
  canStartExport,
  exportProgress,
  estimatedRows,
  estimatedSize,
  validationStatus,
  connection,
  selectedIndex,
  folderPath,
  fileName,
  fileType,
  fields,
  filterQuery,
  overwriteExisting,
  createDirectory,
  beautifyJson,
} = storeToRefs(exportStore);

const isExporting = ref(false);

const validationPercentage = computed(() => {
  const steps = [
    validationStatus.value.step1,
    validationStatus.value.step2,
    validationStatus.value.step3,
  ];
  const completed = steps.filter(Boolean).length;
  return Math.round((completed / steps.length) * 100);
});

const validationClass = computed(() => {
  if (validationPercentage.value === 100) return 'success';
  if (validationPercentage.value >= 50) return 'warning';
  return 'error';
});

const progressPercentage = computed(() => {
  if (!exportProgress.value) return 0;
  const { complete, total } = exportProgress.value;
  if (total === 0) return 0;
  return Math.round((complete / total) * 100);
});

const estimatedDuration = computed(() => {
  if (!estimatedRows.value) return '-';
  // Rough estimate: ~1000 docs per second
  const seconds = Math.ceil(estimatedRows.value / 1000);
  if (seconds < 60) return `~${seconds} secs`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} mins`;
});

const formatNumber = (num: number | null): string => {
  if (num === null) return '-';
  return num.toLocaleString();
};

const handleStartExport = async () => {
  if (!canStartExport.value || !connection.value) return;

  // Check if file exists
  const fileExists = await exportStore.checkFileExist({
    index: selectedIndex.value,
    exportFolder: folderPath.value,
    exportFileName: fileName.value,
    exportFileType: fileType.value,
    filterQuery: filterQuery.value,
    overwriteExisting: overwriteExisting.value,
    createDirectory: createDirectory.value,
    beautifyJson: beautifyJson.value,
  });

  if (fileExists && !overwriteExisting.value) {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('dialogOps.overwriteFile'),
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: () => executeExport(),
    });
    return;
  }

  await executeExport();
};

const executeExport = async () => {
  if (!connection.value) return;

  isExporting.value = true;

  const exportInput: ExportInput = {
    connection: connection.value,
    index: selectedIndex.value,
    exportFolder: folderPath.value,
    exportFileName: fileName.value,
    exportFileType: fileType.value,
    fields: fields.value,
    filterQuery: filterQuery.value,
    overwriteExisting: overwriteExisting.value,
    createDirectory: createDirectory.value,
    beautifyJson: beautifyJson.value,
  };

  // Create task for tracking
  const taskId = ulid();
  exportStore.addRunningTask({
    id: taskId,
    status: 'running',
    progress: { complete: 0, total: estimatedRows.value || 0 },
    connection: connection.value,
    index: selectedIndex.value,
    fileName: fileName.value,
    folderPath: folderPath.value,
    fileType: fileType.value,
    fields: fields.value,
    startTime: new Date(),
  });

  try {
    const filePath = await exportStore.exportToFile(exportInput);
    exportStore.updateTaskStatus(taskId, 'completed');
    message.success(lang.t('export.exportSuccess') + `: ${filePath}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  } catch (err) {
    const error = err as CustomError;
    exportStore.updateTaskStatus(taskId, 'failed', undefined, error.details);
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  } finally {
    isExporting.value = false;
  }
};
</script>

<style lang="scss" scoped>
.execution-card {
  .execution-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .execution-title {
      font-size: 16px;
      font-weight: 600;
    }
  }

  .section {
    margin-bottom: 20px;

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .section-title {
        font-size: 12px;
        color: var(--text-color-3);
        text-transform: uppercase;
        font-weight: 500;
      }

      .validation-status {
        font-size: 12px;
        font-weight: 600;

        &.success {
          color: #18a058;
        }
        &.warning {
          color: #f0a020;
        }
        &.error {
          color: #d03050;
        }
      }
    }
  }

  .section-title-small {
    font-size: 12px;
    color: var(--text-color-3);
    text-transform: uppercase;
    font-weight: 500;
    margin-bottom: 12px;
  }

  .stats-section {
    background-color: var(--card-color);
    border-radius: 8px;
    padding: 12px;

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;

      &:not(:last-child) {
        border-bottom: 1px solid var(--border-color);
      }

      .stat-label {
        font-size: 13px;
        color: var(--text-color-3);
      }

      .stat-value {
        font-size: 13px;
        font-weight: 500;
      }
    }
  }

  .option-row {
    margin-bottom: 12px;

    .option-content {
      display: flex;
      flex-direction: column;

      .option-label {
        font-size: 13px;
        font-weight: 500;
      }

      .option-desc {
        font-size: 11px;
        color: var(--text-color-3);
      }
    }

    .option-content-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;

      .option-label {
        font-size: 13px;
        font-weight: 500;
      }
    }
  }

  .export-action {
    margin-top: 20px;

    .export-note {
      font-size: 11px;
      color: var(--text-color-3);
      text-align: center;
      margin-top: 8px;
    }
  }

  .progress-section {
    margin-top: 16px;

    .progress-text {
      font-size: 12px;
      color: var(--text-color-3);
      text-align: center;
      margin-top: 8px;
    }
  }
}
</style>
