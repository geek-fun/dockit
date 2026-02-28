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
        <!-- FILE TYPE and FILENAME in same row -->
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

        <!-- DESTINATION PATH with folder selector and extra path input -->
        <GridItem :span="2">
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
import { useImportExportStore, FileType } from '../../../store';
import { CustomError } from '../../../common';
import { useMessageService } from '@/composables';

const message = useMessageService();

const exportStore = useImportExportStore();
const { folderPath, fileName, fileType, extraPath } = storeToRefs(exportStore);

const selectedFileType = ref<FileType>(fileType.value || 'jsonl');

const fileTypeOptions = [
  { label: 'JSONL', value: 'jsonl' as FileType },
  { label: 'JSON', value: 'json' as FileType },
  { label: 'CSV', value: 'csv' as FileType },
];

// File extension based on selected type
const fileExtension = computed(() => {
  return selectedFileType.value;
});

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

const handleFileNameChange = (value: string | number) => {
  exportStore.setFileName(String(value));
};

const handleExtraPathChange = (value: string | number) => {
  exportStore.setExtraPath(String(value));
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
</style>
