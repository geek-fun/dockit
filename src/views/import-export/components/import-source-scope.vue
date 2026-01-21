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
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </template>

    <div class="import-steps">
      <div class="step-progress">
        <div :class="['step-node', { completed: step1Complete }]">
          <div
            :class="[
              'step-circle',
              'clickable',
              { completed: step1Complete, active: !step1Complete },
            ]"
            @click="handleSelectDataFile"
          >
            <n-icon v-if="step1Complete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>1</span>
          </div>
          <span class="step-label">{{ $t('import.chooseData') }}</span>
          <span v-if="dataFileName" class="step-file">{{ dataFileName }}</span>
        </div>

        <div class="step-line" :class="{ completed: step1Complete }"></div>

        <div :class="['step-node', { completed: step2Complete }]">
          <div
            :class="[
              'step-circle',
              'clickable',
              { completed: step2Complete, active: step1Complete && !step2Complete },
            ]"
            @click="handleSelectMetadataFile"
          >
            <n-icon v-if="step2Complete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>2</span>
          </div>
          <span class="step-label">{{ $t('import.chooseMetadata') }}</span>
          <span v-if="metadataFileName" class="step-file">{{ metadataFileName }}</span>
        </div>

        <div class="step-line" :class="{ completed: step2Complete }"></div>

        <div :class="['step-node', { completed: step3Complete }]">
          <div :class="['step-circle', { completed: step3Complete }]">
            <n-icon v-if="step3Complete" size="16">
              <Checkmark />
            </n-icon>
            <span v-else>3</span>
          </div>
          <span class="step-label">{{ $t('import.ready') }}</span>
        </div>
      </div>

      <div v-if="importDataFile || importMetadataFile" class="selected-files">
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
import { Document, DocumentAttachment, Checkmark, Close } from '@vicons/carbon';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';

const UploadIcon = Document;

const message = useMessage();

const importExportStore = useImportExportStore();
const { importDataFile, importMetadataFile, importValidationStatus, importValidationErrors } =
  storeToRefs(importExportStore);

const step1Complete = computed(() => importValidationStatus.value.step1);
const step2Complete = computed(() => importValidationStatus.value.step2);
// Step 3 (Ready) should be complete when both step 1 and step 2 are complete
const step3Complete = computed(() => step1Complete.value && step2Complete.value);

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
