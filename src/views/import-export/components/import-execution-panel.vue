<template>
  <Card class="execution-card flex flex-col h-full">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="execution-header">
        <span class="i-carbon-flash h-5 w-5" style="color: #f0a020" />
        <span class="execution-title">{{ $t('export.execution') }}</span>
      </div>
    </CardHeader>
    <CardContent class="flex flex-col flex-1">
      <!-- Validation Readiness -->
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
            <span class="stat-label">{{ $t('import.rowsDetected') }}</span>
            <span class="stat-value">{{ formatNumber(rowCount) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">{{ $t('import.estimatedDuration') }}</span>
            <span class="stat-value">{{ estimatedDuration }}</span>
          </div>
        </div>
      </div>

      <!-- Import Strategy -->
      <div class="strategy-section">
        <div class="section-title-small">{{ $t('import.importStrategy') }}</div>

        <RadioGroup v-model="currentStrategy" class="strategy-options">
          <label
            :class="['strategy-option', { selected: currentStrategy === 'append' }]"
            @click="handleStrategyChange('append')"
          >
            <RadioGroupItem value="append" />
            <div class="strategy-content">
              <span class="strategy-label">{{ $t('import.appendRecords') }}</span>
              <span class="strategy-desc">{{ $t('import.appendRecordsDesc') }}</span>
            </div>
          </label>

          <label
            :class="['strategy-option', { selected: currentStrategy === 'replace' }]"
            @click="handleStrategyChange('replace')"
          >
            <RadioGroupItem value="replace" />
            <div class="strategy-content">
              <span class="strategy-label">{{ $t('import.replaceCollection') }}</span>
              <span class="strategy-desc">{{ $t('import.replaceCollectionDesc') }}</span>
            </div>
          </label>
        </RadioGroup>
      </div>

      <!-- Progress Display -->
      <div v-if="restoreProgress" class="progress-section">
        <Progress
          :percentage="progressPercentage"
          :status="progressPercentage === 100 ? 'success' : 'info'"
        />
        <p class="progress-text">
          {{ restoreProgress.complete }} / {{ restoreProgress.total }} {{ $t('export.documents') }}
        </p>

        <!-- Statistics Box -->
        <div v-if="restoreProgress.complete > 0" class="statistics-box">
          <div class="stat-item">
            <span class="stat-label">{{ $t('import.inserted') }}:</span>
            <span class="stat-value success">{{ formatNumber(restoreProgress.inserted) }}</span>
          </div>
          <div v-if="currentStrategy === 'replace'" class="stat-item">
            <span class="stat-label">{{ $t('import.updated') }}:</span>
            <span class="stat-value info">{{ formatNumber(restoreProgress.updated) }}</span>
          </div>
          <div v-if="restoreProgress.skipped > 0" class="stat-item">
            <span class="stat-label">{{ $t('import.skipped') }}:</span>
            <span class="stat-value warning">{{ formatNumber(restoreProgress.skipped) }}</span>
          </div>
        </div>
      </div>

      <!-- Import Button -->
      <div class="import-action">
        <Button
          class="w-full"
          size="lg"
          :disabled="!canStartImport || isImporting"
          @click="handleStartImport"
        >
          <span class="i-carbon-upload h-4 w-4 mr-2" />
          {{ $t('import.startImportTask') }}
        </Button>
        <p class="import-note">{{ $t('import.importNote') }}</p>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useImportExportStore, ImportStrategy } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { useMessageService, useDialogService } from '@/composables';

const message = useMessageService();
const dialog = useDialogService();
const lang = useLang();

const importExportStore = useImportExportStore();
const {
  canStartImport,
  importValidationPercentage,
  importMetadata,
  importStrategy,
  importTargetIndex,
  restoreProgress,
} = storeToRefs(importExportStore);

const isImporting = ref(false);
const currentStrategy = ref<ImportStrategy>(importStrategy.value);

// Sync currentStrategy with store
watch(importStrategy, newVal => {
  currentStrategy.value = newVal;
});

const validationPercentage = computed(() => importValidationPercentage.value);

const validationClass = computed(() => {
  if (validationPercentage.value === 100) return 'success';
  if (validationPercentage.value >= 50) return 'warning';
  return 'error';
});

const rowCount = computed(() => importMetadata.value?.export?.rowCount ?? null);

const estimatedDuration = computed(() => {
  if (!rowCount.value) return '-';
  // Rough estimate: ~1000 docs per second
  const seconds = Math.ceil(rowCount.value / 1000);
  if (seconds < 60) return `~${seconds} secs`;
  const minutes = Math.ceil(seconds / 60);
  return `~${minutes} mins`;
});

const progressPercentage = computed(() => {
  if (!restoreProgress.value) return 0;
  const { complete, total } = restoreProgress.value;
  if (total === 0) return 0;
  return Math.round((complete / total) * 100);
});

const formatNumber = (num: number | null): string => {
  if (num === null) return '-';
  return num.toLocaleString();
};

const handleStrategyChange = (strategy: ImportStrategy) => {
  currentStrategy.value = strategy;
  importExportStore.setImportStrategy(strategy);
};

const handleStartImport = async () => {
  if (!canStartImport.value) return;

  // If replace strategy, show confirmation dialog
  if (currentStrategy.value === 'replace') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('import.replaceWarning', { index: importTargetIndex.value }),
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: () => {
        executeImport();
      },
      onNegativeClick: () => {
        // Do nothing, dialog closes automatically
      },
    });
    return;
  }

  await executeImport();
};

const executeImport = async () => {
  isImporting.value = true;

  try {
    const result = await importExportStore.executeImport();

    if (result.warning) {
      message.warning(result.warning, {
        closable: true,
        keepAliveOnHover: true,
        duration: 5000,
      });
    }

    message.success(lang.t('import.importSuccess'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  } finally {
    isImporting.value = false;
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

.execution-card .strategy-section {
  margin-bottom: 16px;
}

.execution-card .strategy-section .section-title-small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 12px;
}

.execution-card .strategy-section .strategy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.execution-card .strategy-section .strategy-options .strategy-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.execution-card .strategy-section .strategy-options .strategy-option:hover {
  background: rgba(0, 0, 0, 0.02);
}

.execution-card .strategy-section .strategy-options .strategy-option.selected {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.05);
}

.execution-card .strategy-section .strategy-options .strategy-option .strategy-content {
  display: flex;
  flex-direction: column;
}

.execution-card
  .strategy-section
  .strategy-options
  .strategy-option
  .strategy-content
  .strategy-label {
  font-size: 13px;
  font-weight: 500;
}

.execution-card
  .strategy-section
  .strategy-options
  .strategy-option
  .strategy-content
  .strategy-desc {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
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

.execution-card .progress-section .statistics-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
}

.execution-card .progress-section .statistics-box .stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.execution-card .progress-section .statistics-box .stat-item .stat-label {
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.execution-card .progress-section .statistics-box .stat-item .stat-value {
  font-weight: 600;
  font-size: 14px;
}

.execution-card .progress-section .statistics-box .stat-item .stat-value.success {
  color: #18a058;
}

.execution-card .progress-section .statistics-box .stat-item .stat-value.info {
  color: #2080f0;
}

.execution-card .progress-section .statistics-box .stat-item .stat-value.warning {
  color: #f0a020;
}

.execution-card .import-action {
  margin-top: auto;
  padding-top: 16px;
}

.execution-card .import-action .import-note {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  margin-top: 8px;
}
</style>
