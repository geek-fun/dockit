<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-document-export h-5 w-5" style="color: #18a058" />
        <span class="step-title">{{ $t('export.targetOutput') }}</span>
      </div>
      <span class="step-badge">{{ $t('export.step') }} 03</span>
    </CardHeader>
    <CardContent>
      <Grid :cols="2" :x-gap="16" :y-gap="16">
        <!-- LEFT: FILE TYPE -->
        <GridItem>
          <div class="field-label">{{ $t('export.fileType') }}</div>
          <div class="flex gap-2">
            <Button
              v-for="type in fileTypeOptions"
              :key="type.value"
              :variant="selectedFileType === type.value ? 'default' : 'outline'"
              @click="handleFileTypeChange(type.value)"
            >
              {{ type.label }}
            </Button>
          </div>
        </GridItem>

        <!-- RIGHT: DESTINATION PATH -->
        <GridItem>
          <div class="field-label">{{ $t('export.destinationPath') }}</div>
          <div class="destination-path-row">
            <div class="folder-selector" @click="handleSelectFolder">
              <Button variant="outline" size="icon">
                <span class="i-carbon-folder-open h-4 w-4" />
              </Button>
              <Input
                :model-value="folderPath || $t('export.selectFolderPlaceholder')"
                readonly
                class="folder-path-input cursor-pointer"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
              />
            </div>
            <span class="path-separator">/</span>
            <Input
              v-model="extraPath"
              :placeholder="$t('export.extraPathPlaceholder')"
              class="extra-path-input"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @update:model-value="handleExtraPathChange"
            />
          </div>
        </GridItem>

        <!-- LEFT: INCLUDE METADATA toggle -->
        <GridItem>
          <div class="metadata-toggle-row">
            <Switch :checked="includeMetadata" @update:checked="handleIncludeMetadataChange" />
            <div class="metadata-toggle-labels">
              <span class="metadata-toggle-label">{{ $t('export.includeMetadataLabel') }}</span>
              <span class="metadata-toggle-hint">{{ $t('export.includeMetadataHint') }}</span>
            </div>
          </div>
        </GridItem>

        <!-- RIGHT: FILENAME -->
        <GridItem>
          <div class="field-label">{{ $t('export.filename') }}</div>
          <div class="relative">
            <Input
              v-model="fileName"
              :placeholder="$t('export.filenamePlaceholder')"
              class="pr-16"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @update:model-value="handleFileNameChange"
            />
            <span class="file-extension">{{ `.${fileExtension}` }}</span>
          </div>
        </GridItem>

        <!-- OUTPUT FILE PREVIEW -->
        <GridItem v-if="fileName && folderPath" :span="2">
          <div class="field-label">{{ $t('export.outputFiles') }}</div>
          <div class="output-preview">
            <div class="output-file">
              <span class="i-carbon-document h-3.5 w-3.5 output-file-icon" />
              <span class="output-file-name">{{ fileName }}.{{ fileExtension }}</span>
            </div>
            <div v-if="includeMetadata" class="output-file">
              <span class="i-carbon-document-preliminary h-3.5 w-3.5 output-file-icon" />
              <span class="output-file-name">{{ fileName }}_metadata.json</span>
            </div>
          </div>
        </GridItem>
      </Grid>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Grid, GridItem } from '@/components/ui/grid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useImportExportStore, FileType } from '../../../store';
import { CustomError } from '../../../common';
import { useMessageService } from '@/composables';

const message = useMessageService();

const exportStore = useImportExportStore();
const { folderPath, fileName, fileType, extraPath, includeMetadata } = storeToRefs(exportStore);

const selectedFileType = ref<FileType>(fileType.value || 'jsonl');

const fileTypeOptions = [
  { label: 'JSONL', value: 'jsonl' as FileType },
  { label: 'JSON', value: 'json' as FileType },
  { label: 'CSV', value: 'csv' as FileType },
];

const fileExtension = computed(() => selectedFileType.value);

onMounted(() => {
  if (fileType.value) {
    selectedFileType.value = fileType.value;
  }
});

const handleFileTypeChange = (type: FileType) => {
  selectedFileType.value = type;
  exportStore.setFileType(type);
  exportStore.detachActiveTask('export');
};

const handleFileNameChange = (value: string | number) => {
  exportStore.setFileName(String(value));
  exportStore.detachActiveTask('export');
};

const handleExtraPathChange = (value: string | number) => {
  exportStore.setExtraPath(String(value));
  exportStore.detachActiveTask('export');
};

const handleIncludeMetadataChange = (value: boolean) => {
  exportStore.setIncludeMetadata(value);
  exportStore.detachActiveTask('export');
};

const handleSelectFolder = async () => {
  try {
    await exportStore.selectFolder();
    exportStore.detachActiveTask('export');
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

watch(fileType, newType => {
  if (newType) {
    selectedFileType.value = newType;
  }
});
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

.step-card .field-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 8px;
  text-transform: uppercase;
  font-weight: 500;
}

.step-card .file-extension {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  pointer-events: none;
}

.step-card .destination-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-card .destination-path-row .folder-selector {
  flex: 1;
  display: flex;
  cursor: pointer;
  gap: 0;
}

.step-card .destination-path-row .folder-selector .folder-path-input {
  flex: 1;
  cursor: pointer;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.step-card .destination-path-row .folder-selector button {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.step-card .destination-path-row .path-separator {
  color: hsl(var(--muted-foreground));
  font-size: 14px;
}

.step-card .destination-path-row .extra-path-input {
  flex: 1;
}

.step-card .metadata-toggle-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--muted) / 0.3);
}

.step-card .metadata-toggle-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-card .metadata-toggle-label {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.step-card .metadata-toggle-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.step-card .output-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--muted) / 0.2);
}

.step-card .output-file {
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-card .output-file-icon {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.step-card .output-file-name {
  font-size: 13px;
  font-family: ui-monospace, monospace;
  color: hsl(var(--foreground));
  word-break: break-all;
}
</style>
