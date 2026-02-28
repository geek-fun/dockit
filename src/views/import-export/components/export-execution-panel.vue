<template>
  <Card class="execution-card flex flex-col h-full">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="execution-header">
        <span class="i-carbon-flash h-5 w-5" style="color: #f0a020" />
        <span class="execution-title">{{ $t('export.execution') }}</span>
      </div>
    </CardHeader>
    <CardContent class="flex flex-col flex-1">
      <!-- Validation Readiness - with border and background -->
      <div class="validation-section">
        <div class="section-header">
          <span class="section-title">{{ $t('export.validationReadiness') }}</span>
          <span :class="['validation-status', validationClass]">
            {{ validationPercentage }}% {{ $t('export.pass') }}
          </span>
        </div>
        <Progress
          :percentage="validationPercentage"
          :status="validationPercentage === 100 ? 'success' : 'warning'"
        />
        <div class="stats-rows">
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
      </div>

      <!-- File Handling Options - with border -->
      <div class="file-handling-section">
        <div class="section-title-small">{{ $t('export.fileHandling') }}</div>

        <div class="option-item">
          <label class="flex items-start gap-3 cursor-pointer">
            <Checkbox
              :checked="overwriteExisting"
              @update:checked="val => (overwriteExisting = val)"
            />
            <div class="option-content">
              <span class="option-label">{{ $t('export.overwriteExisting') }}</span>
              <span class="option-desc">{{ $t('export.overwriteExistingDesc') }}</span>
            </div>
          </label>
        </div>

        <div class="option-item">
          <label class="flex items-start gap-3 cursor-pointer">
            <Checkbox :checked="createDirectory" @update:checked="val => (createDirectory = val)" />
            <div class="option-content">
              <span class="option-label">{{ $t('export.createDirectory') }}</span>
              <span class="option-desc">{{ $t('export.createDirectoryDesc') }}</span>
            </div>
          </label>
        </div>

        <div class="option-item toggle-item">
          <span class="option-label">{{ $t('export.beautifyJson') }}</span>
          <Switch :checked="beautifyJson" @update:checked="val => (beautifyJson = val)" />
        </div>
      </div>

      <!-- Progress Display -->
      <div v-if="exportProgress" class="progress-section">
        <Progress
          :percentage="progressPercentage"
          :status="progressPercentage === 100 ? 'success' : 'info'"
        />
        <p class="progress-text">
          {{ exportProgress.complete }} / {{ exportProgress.total }} {{ $t('export.documents') }}
        </p>
      </div>

      <!-- Export Button - at bottom -->
      <div class="export-action">
        <Button
          class="w-full"
          size="lg"
          :disabled="!canStartExport || isExporting"
          @click="handleStartExport"
        >
          <Spinner v-if="isExporting" class="mr-2 h-4 w-4" />
          <span v-else class="i-carbon-download h-4 w-4 mr-2" />
          {{ $t('export.startExportTask') }}
        </Button>
        <p class="export-note">{{ $t('export.exportNote') }}</p>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useImportExportStore, ExportInput } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { ulid } from 'ulidx';
import { sourceFileApi } from '../../../datasources';
import { useMessageService, useDialogService } from '@/composables';

const message = useMessageService();
const dialog = useDialogService();
const lang = useLang();

const exportStore = useImportExportStore();
const {
  canStartExport,
  exportProgress,
  estimatedRows,
  estimatedSize,
  validationStatus,
  connection,
  selectedIndex,
  fileName,
  fileType,
  fields,
  filterQuery,
  overwriteExisting,
  createDirectory,
  beautifyJson,
  getExportPath,
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

  const exportPath = getExportPath.value;

  // Check if directory exists
  const folderExists = await sourceFileApi.exists(exportPath);

  if (!folderExists && !createDirectory.value) {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: `Directory does not exist: ${exportPath}. Please enable "Create Directory" option or create the directory manually.`,
      positiveText: lang.t('dialogOps.createFolder'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: () => {
        // User confirmed, enable createDirectory option
        createDirectory.value = true;
        // User needs to click export button again
      },
    });
    return;
  }

  await continueExportChecks();
};

const continueExportChecks = async () => {
  const exportPath = getExportPath.value;

  // Check if files exist
  const fileExtension = fileType.value;
  const dataFileName = `${fileName.value}.${fileExtension}`;
  const metadataFileName = `${fileName.value}_metadata.json`;
  const dataFilePath = `${exportPath}/${dataFileName}`;
  const metadataFilePath = `${exportPath}/${metadataFileName}`;

  if (!overwriteExisting.value) {
    const dataFileExists = await sourceFileApi.exists(dataFilePath);
    const metadataFileExists = await sourceFileApi.exists(metadataFilePath);

    if (dataFileExists || metadataFileExists) {
      const existingFiles = [];
      if (dataFileExists) existingFiles.push(dataFileName);
      if (metadataFileExists) existingFiles.push(metadataFileName);

      dialog.warning({
        title: lang.t('dialogOps.warning'),
        content: `File(s) already exist: ${existingFiles.join(', ')}. Do you want to overwrite them?`,
        positiveText: lang.t('dialogOps.overwrite'),
        negativeText: lang.t('dialogOps.cancel'),
        onPositiveClick: () => {
          // User confirmed, enable overwriteExisting option
          overwriteExisting.value = true;
          // User needs to click export button again
        },
      });
      return;
    }
  }

  await executeExport();
};

const executeExport = async () => {
  if (!connection.value) return;

  isExporting.value = true;

  const exportPath = getExportPath.value;

  const exportInput: ExportInput = {
    connection: connection.value,
    index: selectedIndex.value,
    exportFolder: exportPath,
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
    folderPath: exportPath,
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

<style scoped>
.execution-card .execution-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.execution-card .execution-header .execution-title {
  font-size: 16px;
  font-weight: 600;
}

.execution-card .validation-section {
  background-color: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.execution-card .validation-section .section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.execution-card .validation-section .section-header .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 500;
}

.execution-card .validation-section .section-header .validation-status {
  font-size: 12px;
  font-weight: 600;
}

.execution-card .validation-section .section-header .validation-status.success {
  color: #18a058;
}

.execution-card .validation-section .section-header .validation-status.warning {
  color: #f0a020;
}

.execution-card .validation-section .section-header .validation-status.error {
  color: #d03050;
}

.execution-card .validation-section .stats-rows {
  margin-top: 12px;
}

.execution-card .validation-section .stats-rows .stat-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.execution-card .validation-section .stats-rows .stat-row:not(:last-child) {
  border-bottom: 1px solid hsl(var(--border));
}

.execution-card .validation-section .stats-rows .stat-row .stat-label {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.execution-card .validation-section .stats-rows .stat-row .stat-value {
  font-size: 13px;
  font-weight: 500;
}

.execution-card .file-handling-section {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.execution-card .file-handling-section .section-title-small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 12px;
}

.execution-card .file-handling-section .option-item {
  padding: 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  margin-bottom: 8px;
}

.execution-card .file-handling-section .option-item:last-child {
  margin-bottom: 0;
}

.execution-card .file-handling-section .option-item .option-content {
  display: flex;
  flex-direction: column;
}

.execution-card .file-handling-section .option-item .option-content .option-label {
  font-size: 13px;
  font-weight: 500;
}

.execution-card .file-handling-section .option-item .option-content .option-desc {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.execution-card .file-handling-section .option-item.toggle-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.execution-card .file-handling-section .option-item.toggle-item .option-label {
  font-size: 13px;
  font-weight: 500;
}

.execution-card .progress-section {
  margin-bottom: 16px;
}

.execution-card .progress-section .progress-text {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  margin-top: 8px;
}

.execution-card .export-action {
  margin-top: auto;
  padding-top: 16px;
}

.execution-card .export-action .export-note {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  margin-top: 8px;
}
</style>
