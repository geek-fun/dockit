<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DataStructured />
        </n-icon>
        <div class="step-title-container">
          <span class="step-title">{{ $t('import.schemaStructure') }}</span>
          <span v-if="hasSchemaData" class="step-subtitle">
            {{
              isNewCollection ? $t('import.schemaFromMetadata') : $t('import.schemaFromExisting')
            }}
          </span>
        </div>
      </div>
    </template>
    <template #header-extra>
      <div class="header-extra">
        <n-button
          v-if="hasDataFile"
          text
          type="primary"
          :loading="loading"
          @click="handleRefreshSchema"
        >
          {{ $t('export.refresh') }}
        </n-button>
        <span class="step-badge">{{ $t('export.step') }} 03</span>
      </div>
    </template>

    <!-- Empty State: No data file selected -->
    <div v-if="!hasDataFile" class="empty-state">
      <n-empty :description="$t('import.selectDataFirst')">
        <template #icon>
          <n-icon size="48">
            <DataStructured />
          </n-icon>
        </template>
      </n-empty>
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
              <n-tag :type="getDbTypeColor(importMetadata.source.dbType)">
                {{ importMetadata.source.dbType.toUpperCase() }}
              </n-tag>
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
                <n-tag :type="getTypeColor(field.sourceType)" size="small">
                  {{ field.sourceType }}
                </n-tag>
              </span>
              <span class="col-target-type">
                <n-tag
                  v-if="field.targetType !== '-'"
                  :type="getTypeColor(field.targetType)"
                  size="small"
                >
                  {{ field.targetType }}
                </n-tag>
                <span v-else class="no-match">-</span>
              </span>
              <span class="col-match">
                <n-tag v-if="field.matched" type="success" size="small">
                  {{ $t('import.matched') }}
                </n-tag>
                <n-tag v-else type="warning" size="small">
                  {{ $t('import.notMatched') }}
                </n-tag>
              </span>
              <span class="col-exclude">
                <n-checkbox
                  :checked="field.exclude"
                  @update:checked="toggleFieldExclude(field.name)"
                />
              </span>
            </div>
          </div>
        </div>
        <p class="schema-hint">{{ $t('import.excludeFieldsHint') }}</p>
      </div>

      <!-- No schema fields yet -->
      <div v-else class="empty-state-small">
        <n-spin size="small" />
        <span class="loading-text">{{ $t('import.analyzingSchema') }}</span>
      </div>

      <!-- Comments (only for new collection with metadata) -->
      <div v-if="isNewCollection && importMetadata?.comments" class="comments-section">
        <h4 class="section-title">{{ $t('import.comments') }}</h4>
        <p class="comments-text">{{ importMetadata.comments }}</p>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { DataStructured } from '@vicons/carbon';
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

const getDbTypeColor = (type: string): 'info' | 'success' | 'warning' | 'error' | 'default' => {
  const typeColors: { [key: string]: 'info' | 'success' | 'warning' | 'error' | 'default' } = {
    elasticsearch: 'success',
    dynamodb: 'info',
  };
  return typeColors[type.toLowerCase()] || 'default';
};

const getTypeColor = (type: string): 'info' | 'success' | 'warning' | 'error' | 'default' => {
  const typeColors: { [key: string]: 'info' | 'success' | 'warning' | 'error' | 'default' } = {
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
    OBJECT: 'error',
    NESTED: 'error',
    ARRAY: 'error',
  };
  return typeColors[type] || 'default';
};
</script>

<style lang="scss" scoped>
.step-card {
  .step-header {
    display: flex;
    align-items: center;
    gap: 8px;

    .step-title-container {
      display: flex;
      flex-direction: column;

      .step-title {
        font-size: 16px;
        font-weight: 600;
      }

      .step-subtitle {
        font-size: 12px;
        color: var(--text-color-3);
      }
    }
  }

  .header-extra {
    display: flex;
    align-items: center;
    gap: 16px;

    .step-badge {
      font-size: 12px;
      color: var(--text-color-3);
      font-weight: 500;
    }
  }

  .empty-state {
    padding: 40px 0;
  }

  .empty-state-small {
    padding: 24px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;

    .loading-text {
      font-size: 13px;
      color: var(--text-color-3);
    }
  }

  .schema-info {
    .info-section {
      margin-bottom: 24px;

      .section-title {
        font-size: 12px;
        color: var(--text-color-3);
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .info-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;

          .info-label {
            font-size: 11px;
            color: var(--text-color-3);
            text-transform: uppercase;
          }

          .info-value {
            font-size: 13px;
            font-weight: 500;
          }
        }
      }
    }

    .schema-section {
      .section-title {
        font-size: 12px;
        color: var(--text-color-3);
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 12px;
      }

      .schema-table {
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;

        .schema-header {
          display: flex;
          padding: 12px 16px;
          background: var(--card-color);
          border-bottom: 1px solid var(--border-color);
          font-size: 11px;
          color: var(--text-color-3);
          text-transform: uppercase;
          font-weight: 600;
        }

        .schema-body {
          max-height: 300px;
          overflow-y: auto;
        }

        .schema-row {
          display: flex;
          padding: 10px 16px;
          border-bottom: 1px solid var(--border-color);
          align-items: center;

          &:last-child {
            border-bottom: none;
          }

          &:hover {
            background: rgba(0, 0, 0, 0.02);
          }

          &.row-excluded {
            opacity: 0.5;
            text-decoration: line-through;
          }

          &.row-mismatch {
            background: rgba(250, 173, 20, 0.05);
          }
        }

        .col-field {
          flex: 2;
          font-family: monospace;
          font-size: 12px;
        }

        .col-source-type,
        .col-target-type {
          flex: 1;
        }

        .col-match {
          flex: 1;
        }

        .col-exclude {
          flex: 0.5;
          text-align: center;
        }

        .no-match {
          color: var(--text-color-3);
        }
      }

      .schema-hint {
        font-size: 11px;
        color: var(--text-color-3);
        margin-top: 8px;
        margin-bottom: 0;
      }
    }

    .comments-section {
      margin-top: 24px;

      .section-title {
        font-size: 12px;
        color: var(--text-color-3);
        text-transform: uppercase;
        font-weight: 600;
        margin-bottom: 8px;
      }

      .comments-text {
        font-size: 13px;
        color: var(--text-color-2);
        padding: 12px;
        background: var(--card-color);
        border-radius: 8px;
        margin: 0;
      }
    }
  }
}
</style>
