<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-document h-5 w-5" style="color: #18a058" />
        <span class="step-title">{{ $t('import.sourceScope') }}</span>
      </div>
      <span class="step-badge">{{ $t('export.step') }} 02</span>
    </CardHeader>
    <CardContent>
      <!-- Not configured yet -->
      <div v-if="!hasTarget" class="empty-state">
        <Empty :description="$t('import.selectTargetFirst')">
          <template #icon>
            <span class="i-carbon-document h-12 w-12" />
          </template>
        </Empty>
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
              <span v-if="metadataComplete" class="i-carbon-checkmark h-4 w-4" />
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
              <span v-if="dataComplete" class="i-carbon-checkmark h-4 w-4" />
              <span v-else>2</span>
            </div>
            <span class="step-label">{{ $t('import.chooseData') }}</span>
            <span v-if="dataFileName" class="step-file">{{ dataFileName }}</span>
          </div>

          <div class="step-line" :class="{ completed: dataComplete }"></div>

          <!-- Step 3: Ready -->
          <div :class="['step-node', { completed: allComplete, error: hasDataError }]">
            <div :class="['step-circle', { completed: allComplete, error: hasDataError }]">
              <span v-if="allComplete" class="i-carbon-checkmark h-4 w-4" />
              <span v-else-if="hasDataError" class="i-carbon-error-filled h-4 w-4" />
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
            <span class="i-carbon-document-attachment h-4.5 w-4.5" />
            <span class="file-path">{{ importMetadataFile }}</span>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="clearMetadataFile">
              <span class="i-carbon-close h-4 w-4" />
            </Button>
          </div>

          <div v-if="importDataFile" class="file-item">
            <span class="i-carbon-document h-4.5 w-4.5" />
            <span class="file-path">{{ importDataFile }}</span>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="clearDataFile">
              <span class="i-carbon-close h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Validation Errors -->
        <div v-if="importValidationErrors.length > 0" class="validation-errors">
          <Alert variant="destructive">
            <AlertTitle>{{ $t('import.validationErrors') }}</AlertTitle>
            <AlertDescription>
              <ul class="error-list">
                <li v-for="(error, index) in importValidationErrors" :key="index">{{ error }}</li>
              </ul>
            </AlertDescription>
          </Alert>
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
              <span v-if="dataComplete" class="i-carbon-checkmark h-4 w-4" />
              <span v-else>1</span>
            </div>
            <span class="step-label">{{ $t('import.chooseData') }}</span>
            <span v-if="dataFileName" class="step-file">{{ dataFileName }}</span>
          </div>

          <div class="step-line" :class="{ completed: dataComplete }"></div>

          <!-- Step 2: Ready -->
          <div :class="['step-node', { completed: dataComplete, error: hasDataError }]">
            <div :class="['step-circle', { completed: dataComplete, error: hasDataError }]">
              <span v-if="dataComplete" class="i-carbon-checkmark h-4 w-4" />
              <span v-else-if="hasDataError" class="i-carbon-error-filled h-4 w-4" />
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
            <span class="i-carbon-document h-4.5 w-4.5" />
            <span class="file-path">{{ importDataFile }}</span>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="clearDataFile">
              <span class="i-carbon-close h-4 w-4" />
            </Button>
          </div>
        </div>

        <!-- Validation Errors -->
        <div v-if="importValidationErrors.length > 0" class="validation-errors">
          <Alert variant="destructive">
            <AlertTitle>{{ $t('import.validationErrors') }}</AlertTitle>
            <AlertDescription>
              <ul class="error-list">
                <li v-for="(error, index) in importValidationErrors" :key="index">{{ error }}</li>
              </ul>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';
import { useMessageService } from '@/composables';

const message = useMessageService();

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

<style scoped>
.step-card .step-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-card .step-header .step-title {
  font-size: 16px;
  font-weight: 600;
}

.step-card .step-badge {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.step-card .empty-state {
  padding: 40px 0;
}

.step-card .import-steps .step-progress {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  background-color: hsl(var(--card));
  border: 2px dashed hsl(var(--border));
  border-radius: 12px;
  margin-bottom: 16px;
}

.step-card .import-steps .step-progress .step-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 100px;
}

.step-card .import-steps .step-progress .step-node .step-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid hsl(var(--border));
  background: hsl(var(--card));
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  transition: all 0.3s;
}

.step-card .import-steps .step-progress .step-node .step-circle.active {
  border-color: #18a058;
  color: #18a058;
}

.step-card .import-steps .step-progress .step-node .step-circle.completed {
  background: #18a058;
  border-color: #18a058;
  color: white;
}

.step-card .import-steps .step-progress .step-node .step-circle.error {
  background: #d03050;
  border-color: #d03050;
  color: white;
}

.step-card .import-steps .step-progress .step-node .step-circle.clickable {
  cursor: pointer;
}

.step-card .import-steps .step-progress .step-node .step-circle.clickable:hover {
  border-color: #18a058;
  opacity: 0.8;
}

.step-card .import-steps .step-progress .step-node .step-label {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: hsl(var(--foreground));
}

.step-card .import-steps .step-progress .step-node .step-file {
  margin-top: 4px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-card .import-steps .step-progress .step-line {
  flex: 1;
  height: 2px;
  background: hsl(var(--border));
  margin: 20px 8px 0;
  max-width: 80px;
  transition: background 0.3s;
}

.step-card .import-steps .step-progress .step-line.completed {
  background: #18a058;
}

.step-card .import-steps .selected-files {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-card .import-steps .selected-files .file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.step-card .import-steps .selected-files .file-item .file-path {
  flex: 1;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-card .import-steps .validation-errors {
  margin-top: 16px;
}

.step-card .import-steps .validation-errors .error-list {
  margin: 0;
  padding-left: 20px;
}

.step-card .import-steps .validation-errors .error-list li {
  margin: 4px 0;
  font-size: 12px;
}
</style>
