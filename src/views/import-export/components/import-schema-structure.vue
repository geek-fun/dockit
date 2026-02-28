<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-structured h-5 w-5" style="color: #18a058" />
        <div class="step-title-container">
          <span class="step-title">{{ $t('import.schemaStructure') }}</span>
          <span v-if="hasSchemaData" class="step-subtitle">
            {{
              isNewCollection ? $t('import.schemaFromMetadata') : $t('import.schemaFromExisting')
            }}
          </span>
        </div>
      </div>
      <div class="header-extra">
        <Button
          v-if="hasDataFile"
          variant="ghost"
          size="sm"
          :disabled="loading"
          @click="handleRefreshSchema"
        >
          {{ $t('export.refresh') }}
        </Button>
        <span class="step-badge">{{ $t('export.step') }} 03</span>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Empty State: No data file selected -->
      <div v-if="!hasDataFile" class="empty-state">
        <Empty :description="$t('import.selectDataFirst')">
          <template #icon>
            <span class="i-carbon-data-structured h-12 w-12" />
          </template>
        </Empty>
      </div>

      <!-- Schema Info -->
      <div v-else class="schema-info">
        <!-- Source Info (only for new collection with metadata) -->
        <div v-if="isNewCollection && importMetadata" class="info-section">
          <h4 class="section-title">{{ $t('import.sourceInfo') }}</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">{{ $t('import.databaseType') }}</span>
              <span class="info-value">
                <Badge :variant="getDbTypeVariant(importMetadata.source.dbType)">
                  {{ importMetadata.source.dbType.toUpperCase() }}
                </Badge>
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('import.sourceName') }}</span>
              <span class="info-value">{{ importMetadata.source.sourceName }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('import.exportedAt') }}</span>
              <span class="info-value">{{ formatDate(importMetadata.export.exportedAt) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('import.rowCount') }}</span>
              <span class="info-value">{{ formatNumber(importMetadata.export.rowCount) }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('import.schemaVersion') }}</span>
              <span class="info-value">{{ importMetadata.version }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">{{ $t('import.format') }}</span>
              <span class="info-value">{{ importMetadata.export.format.toUpperCase() }}</span>
            </div>
          </div>
        </div>

        <!-- Schema Comparison Table -->
        <div v-if="importSchemaFields.length > 0" class="schema-section">
          <h4 class="section-title">{{ $t('import.schemaComparison') }}</h4>
          <div class="schema-table">
            <div class="schema-header">
              <span class="col-field">{{ $t('export.field') }}</span>
              <span class="col-source-type">{{ $t('import.sourceType') }}</span>
              <span class="col-target-type">{{ $t('import.targetType') }}</span>
              <span class="col-match">{{ $t('import.matchStatus') }}</span>
              <span class="col-exclude">{{ $t('import.exclude') }}</span>
            </div>
            <div class="schema-body">
              <div
                v-for="field in importSchemaFields"
                :key="field.name"
                :class="[
                  'schema-row',
                  { 'row-excluded': field.exclude, 'row-mismatch': !field.matched },
                ]"
              >
                <span class="col-field">{{ field.name }}</span>
                <span class="col-source-type">
                  <Badge :variant="getTypeVariant(field.sourceType)" class="text-xs">
                    {{ field.sourceType }}
                  </Badge>
                </span>
                <span class="col-target-type">
                  <Badge
                    v-if="field.targetType !== '-'"
                    :variant="getTypeVariant(field.targetType)"
                    class="text-xs"
                  >
                    {{ field.targetType }}
                  </Badge>
                  <span v-else class="no-match">-</span>
                </span>
                <span class="col-match">
                  <Badge v-if="field.matched" variant="success" class="text-xs">
                    {{ $t('import.matched') }}
                  </Badge>
                  <Badge v-else variant="warning" class="text-xs">
                    {{ $t('import.notMatched') }}
                  </Badge>
                </span>
                <span class="col-exclude">
                  <Checkbox
                    :checked="field.exclude"
                    @update:checked="toggleFieldExclude(field.name)"
                  />
                </span>
              </div>
            </div>
          </div>
          <p class="schema-hint">{{ $t('import.excludeFieldsHint') }}</p>
        </div>

        <!-- Comments (only for new collection with metadata) -->
        <div v-if="isNewCollection && importMetadata?.comments" class="comments-section">
          <h4 class="section-title">{{ $t('import.comments') }}</h4>
          <p class="comments-text">{{ importMetadata.comments }}</p>
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
import { Badge, type BadgeVariants } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useImportExportStore } from '../../../store';

const importExportStore = useImportExportStore();
const { importMetadata, importDataFile, importSchemaFields, importIsNewCollection } =
  storeToRefs(importExportStore);

const loading = ref(false);

const hasDataFile = computed(() => !!importDataFile.value);
const isNewCollection = computed(() => importIsNewCollection.value);
const hasSchemaData = computed(() => importSchemaFields.value.length > 0);

const handleRefreshSchema = async () => {
  loading.value = true;
  try {
    await importExportStore.buildSchemaComparison();
  } finally {
    loading.value = false;
  }
};

const toggleFieldExclude = (fieldName: string) => {
  importExportStore.toggleSchemaFieldExclude(fieldName);
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const getDbTypeVariant = (type: string): BadgeVariants['variant'] => {
  const typeVariants: { [key: string]: BadgeVariants['variant'] } = {
    elasticsearch: 'success',
    dynamodb: 'info',
  };
  return typeVariants[type.toLowerCase()] || 'secondary';
};

const getTypeVariant = (type: string): BadgeVariants['variant'] => {
  const typeVariants: { [key: string]: BadgeVariants['variant'] } = {
    TEXT: 'success',
    STRING: 'success',
    KEYWORD: 'success',
    NUMBER: 'info',
    INTEGER: 'info',
    LONG: 'info',
    FLOAT: 'info',
    DOUBLE: 'info',
    BOOLEAN: 'warning',
    DATE: 'warning',
    OBJECT: 'destructive',
    NESTED: 'destructive',
    ARRAY: 'destructive',
  };
  return typeVariants[type] || 'secondary';
};
</script>

<style scoped>
.step-card .step-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-card .step-header .step-title-container {
  display: flex;
  flex-direction: column;
}

.step-card .step-header .step-title-container .step-title {
  font-size: 16px;
  font-weight: 600;
}

.step-card .step-header .step-title-container .step-subtitle {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.step-card .header-extra {
  display: flex;
  align-items: center;
  gap: 16px;
}

.step-card .header-extra .step-badge {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.step-card .empty-state {
  padding: 40px 0;
}

.step-card .empty-state-small {
  padding: 24px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.step-card .empty-state-small .loading-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.step-card .schema-info .info-section {
  margin-bottom: 24px;
}

.step-card .schema-info .info-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 12px;
}

.step-card .schema-info .info-section .info-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.step-card .schema-info .info-section .info-grid .info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-card .schema-info .info-section .info-grid .info-item .info-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
}

.step-card .schema-info .info-section .info-grid .info-item .info-value {
  font-size: 13px;
  font-weight: 500;
}

.step-card .schema-info .schema-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 12px;
}

.step-card .schema-info .schema-section .schema-table {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
}

.step-card .schema-info .schema-section .schema-table .schema-header {
  display: flex;
  padding: 12px 16px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
}

.step-card .schema-info .schema-section .schema-table .schema-body {
  max-height: 300px;
  overflow-y: auto;
}

.step-card .schema-info .schema-section .schema-table .schema-row {
  display: flex;
  padding: 10px 16px;
  border-bottom: 1px solid hsl(var(--border));
  align-items: center;
}

.step-card .schema-info .schema-section .schema-table .schema-row:last-child {
  border-bottom: none;
}

.step-card .schema-info .schema-section .schema-table .schema-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.step-card .schema-info .schema-section .schema-table .schema-row.row-excluded {
  opacity: 0.5;
  text-decoration: line-through;
}

.step-card .schema-info .schema-section .schema-table .schema-row.row-mismatch {
  background: rgba(250, 173, 20, 0.05);
}

.step-card .schema-info .schema-section .schema-table .col-field {
  flex: 2;
  font-family: monospace;
  font-size: 12px;
}

.step-card .schema-info .schema-section .schema-table .col-source-type,
.step-card .schema-info .schema-section .schema-table .col-target-type {
  flex: 1;
}

.step-card .schema-info .schema-section .schema-table .col-match {
  flex: 1;
}

.step-card .schema-info .schema-section .schema-table .col-exclude {
  flex: 0.5;
  text-align: center;
}

.step-card .schema-info .schema-section .schema-table .no-match {
  color: hsl(var(--muted-foreground));
}

.step-card .schema-info .schema-section .schema-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
  margin-bottom: 0;
}

.step-card .schema-info .comments-section {
  margin-top: 24px;
}

.step-card .schema-info .comments-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}

.step-card .schema-info .comments-section .comments-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  padding: 12px;
  background: hsl(var(--card));
  border-radius: 8px;
  margin: 0;
}
</style>
