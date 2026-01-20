<template>
  <n-card
    class="execution-card"
    :content-style="{ display: 'flex', flexDirection: 'column', flex: 1 }"
  >
    <template #header>
      <div class="execution-header">
        <n-icon size="20" color="#f0a020">
          <Flash />
        </n-icon>
        <span class="execution-title">{{ $t('export.execution') }}</span>
      </div>
    </template>

    <!-- Validation Readiness -->
    <div class="validation-section">
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

      <div class="strategy-options">
        <label
          :class="['strategy-option', { selected: importStrategy === 'append' }]"
          @click="handleStrategyChange('append')"
        >
          <n-radio :checked="importStrategy === 'append'" value="append" />
          <div class="strategy-content">
            <span class="strategy-label">{{ $t('import.appendRecords') }}</span>
            <span class="strategy-desc">{{ $t('import.appendRecordsDesc') }}</span>
          </div>
        </label>

        <label
          :class="['strategy-option', { selected: importStrategy === 'replace' }]"
          @click="handleStrategyChange('replace')"
        >
          <n-radio :checked="importStrategy === 'replace'" value="replace" />
          <div class="strategy-content">
            <span class="strategy-label">{{ $t('import.replaceCollection') }}</span>
            <span class="strategy-desc">{{ $t('import.replaceCollectionDesc') }}</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Progress Display -->
    <div v-if="restoreProgress" class="progress-section">
      <n-progress
        type="line"
        :percentage="progressPercentage"
        :status="progressPercentage === 100 ? 'success' : 'info'"
        indicator-placement="inside"
        :processing="progressPercentage < 100"
      />
      <p class="progress-text">
        {{ restoreProgress.complete }} / {{ restoreProgress.total }} {{ $t('export.documents') }}
      </p>
    </div>

    <!-- Import Button -->
    <div class="import-action">
      <n-button
        type="primary"
        size="large"
        block
        :disabled="!canStartImport"
        :loading="isImporting"
        @click="handleStartImport"
      >
        <template #icon>
          <n-icon>
            <Upload />
          </n-icon>
        </template>
        {{ $t('import.startImportTask') }}
      </n-button>
      <p class="import-note">{{ $t('import.importNote') }}</p>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Flash, Upload } from '@vicons/carbon';
import { useImportExportStore, ImportStrategy } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const dialog = useDialog();
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
  importExportStore.setImportStrategy(strategy);
};

const handleStartImport = async () => {
  if (!canStartImport.value) return;

  // If replace strategy, show confirmation dialog
  if (importStrategy.value === 'replace') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('import.replaceWarning', { index: importTargetIndex.value }),
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: () => executeImport(),
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

<style lang="scss" scoped>
.execution-card {
  display: flex;
  flex-direction: column;
  height: 100%;

  .execution-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .execution-title {
      font-size: 16px;
      font-weight: 600;
    }
  }

  .validation-section {
    background-color: var(--card-color);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;

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

    .stats-rows {
      margin-top: 12px;

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
  }

  .strategy-section {
    margin-bottom: 16px;

    .section-title-small {
      font-size: 12px;
      color: var(--text-color-3);
      text-transform: uppercase;
      font-weight: 500;
      margin-bottom: 12px;
    }

    .strategy-options {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .strategy-option {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          background: rgba(0, 0, 0, 0.02);
        }

        &.selected {
          border-color: #18a058;
          background: rgba(24, 160, 88, 0.05);
        }

        .strategy-content {
          display: flex;
          flex-direction: column;

          .strategy-label {
            font-size: 13px;
            font-weight: 500;
          }

          .strategy-desc {
            font-size: 11px;
            color: var(--text-color-3);
          }
        }
      }
    }
  }

  .progress-section {
    margin-bottom: 16px;

    .progress-text {
      font-size: 12px;
      color: var(--text-color-3);
      text-align: center;
      margin-top: 8px;
    }
  }

  .import-action {
    margin-top: auto;
    padding-top: 16px;

    .import-note {
      font-size: 11px;
      color: var(--text-color-3);
      text-align: center;
      margin-top: 8px;
    }
  }
}
</style>
