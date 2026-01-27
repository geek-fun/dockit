<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <UploadIcon />
        </n-icon>
        <span class="step-title">{{ $t('import.sourceScope') }}</span>
      </div>
    </template>
    <template #header-extra>
      <span class="step-badge">{{ $t('export.step') }} 02</span>
    </template>

    <!-- Not configured yet -->
    <div v-if="!hasTarget" class="empty-state">
      <n-empty :description="$t('import.selectTargetFirst')">
        <template #icon>
          <n-icon size="48">
            <UploadIcon />
          </n-icon>
        </template>
      </n-empty>
    </div>

    <!-- New Collection Flow: CHOOSE METADATA -> CHOOSE DATA -> READY -->
    <div v-else-if="isNewCollection" class="import-steps">
      <div class="step-progress">
        <!-- Step 1: Choose Metadata (required for new collection) -->
        <div :class="['step-node', { completed: metadataComplete }]">
          <div
            :class="[
              'step-circle',
              'clickable',
              { completed: metadataComplete, active: !metadataComplete },
            ]"
            @click="handleSelectMetadataFile"
          >
            <n-icon v-if="metadataComplete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>1</span>
          </div>
          <span class="step-label">{{ $t('import.chooseMetadata') }}</span>
          <span v-if="metadataFileName" class="step-file">{{ metadataFileName }}</span>
        </div>

        <div class="step-line" :class="{ completed: metadataComplete }"></div>

        <!-- Step 2: Choose Data -->
        <div :class="['step-node', { completed: dataComplete }]">
          <div
            :class="[
              'step-circle',
              'clickable',
              { completed: dataComplete, active: metadataComplete && !dataComplete },
            ]"
            @click="handleSelectDataFile"
          >
            <n-icon v-if="dataComplete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>2</span>
          </div>
          <span class="step-label">{{ $t('import.chooseData') }}</span>
          <span v-if="dataFileName" class="step-file">{{ dataFileName }}</span>
        </div>

        <div class="step-line" :class="{ completed: dataComplete }"></div>

        <!-- Step 3: Ready -->
        <div :class="['step-node', { completed: allComplete, error: hasDataError }]">
          <div :class="['step-circle', { completed: allComplete, error: hasDataError }]">
            <n-icon v-if="allComplete" size="16">
              <Checkmark />
            </n-icon>
            <n-icon v-else-if="hasDataError" size="16">
              <ErrorFilled />
            </n-icon>
            <span v-else>3</span>
          </div>
          <span class="step-label">
            {{ hasDataError ? $t('import.error') : $t('import.ready') }}
          </span>
        </div>
      </div>

      <!-- Selected Files -->
      <div v-if="importDataFile || importMetadataFile" class="selected-files">
        <div v-if="importMetadataFile" class="file-item">
          <n-icon size="18">
            <DocumentAttachment />
          </n-icon>
          <span class="file-path">{{ importMetadataFile }}</span>
          <n-button text @click="clearMetadataFile">
            <n-icon size="16">
              <Close />
            </n-icon>
          </n-button>
        </div>

        <div v-if="importDataFile" class="file-item">
          <n-icon size="18">
            <Document />
          </n-icon>
          <span class="file-path">{{ importDataFile }}</span>
          <n-button text @click="clearDataFile">
            <n-icon size="16">
              <Close />
            </n-icon>
          </n-button>
        </div>
      </div>

      <!-- Validation Errors -->
      <div v-if="importValidationErrors.length > 0" class="validation-errors">
        <n-alert type="error" :title="$t('import.validationErrors')">
          <ul class="error-list">
            <li v-for="(error, index) in importValidationErrors" :key="index">{{ error }}</li>
          </ul>
        </n-alert>
      </div>
    </div>

    <!-- Existing Collection Flow: CHOOSE DATA -> READY (no metadata needed) -->
    <div v-else class="import-steps">
      <div class="step-progress">
        <!-- Step 1: Choose Data -->
        <div :class="['step-node', { completed: dataComplete }]">
          <div
            :class="[
              'step-circle',
              'clickable',
              { completed: dataComplete, active: !dataComplete },
            ]"
            @click="handleSelectDataFile"
          >
            <n-icon v-if="dataComplete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>1</span>
          </div>
          <span class="step-label">{{ $t('import.chooseData') }}</span>
          <span v-if="dataFileName" class="step-file">{{ dataFileName }}</span>
        </div>

        <div class="step-line" :class="{ completed: dataComplete }"></div>

        <!-- Step 2: Ready -->
        <div :class="['step-node', { completed: dataComplete, error: hasDataError }]">
          <div :class="['step-circle', { completed: dataComplete, error: hasDataError }]">
            <n-icon v-if="dataComplete" size="16">
              <Checkmark />
            </n-icon>
            <n-icon v-else-if="hasDataError" size="16">
              <ErrorFilled />
            </n-icon>
            <span v-else>2</span>
          </div>
          <span class="step-label">
            {{ hasDataError ? $t('import.error') : $t('import.ready') }}
          </span>
        </div>
      </div>

      <!-- Selected Files -->
      <div v-if="importDataFile" class="selected-files">
        <div class="file-item">
          <n-icon size="18">
            <Document />
          </n-icon>
          <span class="file-path">{{ importDataFile }}</span>
          <n-button text @click="clearDataFile">
            <n-icon size="16">
              <Close />
            </n-icon>
          </n-button>
        </div>
      </div>

      <!-- Validation Errors -->
      <div v-if="importValidationErrors.length > 0" class="validation-errors">
        <n-alert type="error" :title="$t('import.validationErrors')">
          <ul class="error-list">
            <li v-for="(error, index) in importValidationErrors" :key="index">{{ error }}</li>
          </ul>
        </n-alert>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Document, DocumentAttachment, Checkmark, Close, ErrorFilled } from '@vicons/carbon';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';

const UploadIcon = Document;

const message = useMessage();

const importExportStore = useImportExportStore();
const {
  importDataFile,
  importMetadataFile,
  importMetadata,
  importValidationErrors,
  importValidationStatus,
  importIsNewCollection,
  importConnection,
  importTargetIndex,
} = storeToRefs(importExportStore);

// Check if target is configured (Step 1 complete)
const hasTarget = computed(() => !!importConnection.value && !!importTargetIndex.value);

// Check if this is a new collection
const isNewCollection = computed(() => importIsNewCollection.value);

// Data file complete - must have file AND pass validation (step2)
const dataComplete = computed(() => importValidationStatus.value.step2);

// Metadata complete (only relevant for new collections)
const metadataComplete = computed(() => !!importMetadata.value);

// All complete - depends on collection type and validation
const allComplete = computed(() => {
  if (isNewCollection.value) {
    // New collection: need step3 to pass (which requires metadata, data, and no errors)
    return importValidationStatus.value.step3;
  }
  // Existing collection: need step3 to pass (which requires data and no errors)
  return importValidationStatus.value.step3;
});

// Has validation errors
const hasValidationErrors = computed(() => importValidationErrors.value.length > 0);

// Check if data file is selected but validation failed
const hasDataError = computed(() => !!importDataFile.value && hasValidationErrors.value);

const dataFileName = computed(() => {
  if (!importDataFile.value) return '';
  return importDataFile.value.split('/').pop() || '';
});

const metadataFileName = computed(() => {
  if (!importMetadataFile.value) return '';
  return importMetadataFile.value.split('/').pop() || '';
});

const handleSelectDataFile = async () => {
  try {
    await importExportStore.selectImportDataFile();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

const handleSelectMetadataFile = async () => {
  try {
    await importExportStore.selectImportMetadataFile();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

const clearDataFile = () => {
  importExportStore.clearImportDataFile();
};

const clearMetadataFile = () => {
  importExportStore.clearImportMetadataFile();
};
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

  .empty-state {
    padding: 40px 0;
  }

  .import-steps {
    .step-progress {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 24px 16px;
      background-color: var(--card-color);
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      margin-bottom: 16px;

      .step-node {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 100px;

        .step-circle {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid var(--border-color);
          background: var(--card-color);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.3s;

          &.active {
            border-color: #18a058;
            color: #18a058;
          }

          &.completed {
            background: #18a058;
            border-color: #18a058;
            color: white;
          }

          &.error {
            background: #d03050;
            border-color: #d03050;
            color: white;
          }

          &.clickable {
            cursor: pointer;

            &:hover {
              border-color: #18a058;
              opacity: 0.8;
            }
          }
        }

        .step-label {
          margin-top: 8px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-color-1);
        }

        .step-file {
          margin-top: 4px;
          font-size: 10px;
          color: var(--text-color-3);
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .step-line {
        flex: 1;
        height: 2px;
        background: var(--border-color);
        margin: 20px 8px 0;
        max-width: 80px;
        transition: background 0.3s;

        &.completed {
          background: #18a058;
        }
      }
    }

    .selected-files {
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;

      .file-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--card-color);
        border: 1px solid var(--border-color);
        border-radius: 6px;

        .file-path {
          flex: 1;
          font-size: 12px;
          color: var(--text-color-2);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }

    .validation-errors {
      margin-top: 16px;

      .error-list {
        margin: 0;
        padding-left: 20px;

        li {
          margin: 4px 0;
          font-size: 12px;
        }
      }
    }
  }
}
</style>
