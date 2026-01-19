<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DataStructured />
        </n-icon>
        <div class="step-title-container">
          <span class="step-title">{{ $t('import.schemaStructure') }}</span>
          <span v-if="importMetadata" class="step-subtitle">
            {{ $t('import.schemaFromMetadata') }}
          </span>
        </div>
      </div>
    </template>
    <template #header-extra>
      <div class="header-extra">
        <n-button text type="primary" @click="handleRefreshMetadata" :loading="loading">
          {{ $t('export.refresh') }}
        </n-button>
        <span class="step-badge">{{ $t('export.step') }} 02</span>
      </div>
    </template>

    <!-- Validation Errors -->
    <div v-if="importValidationErrors.length > 0" class="validation-errors">
      <n-alert type="error" :title="$t('import.validationErrors')">
        <ul class="error-list">
          <li v-for="(error, index) in importValidationErrors" :key="index">{{ error }}</li>
        </ul>
      </n-alert>
    </div>

    <!-- Empty State -->
    <div v-else-if="!importMetadata" class="empty-state">
      <n-empty :description="$t('import.selectMetadataFirst')">
        <template #icon>
          <n-icon size="48">
            <DataStructured />
          </n-icon>
        </template>
      </n-empty>
    </div>

    <!-- Metadata Info -->
    <div v-else class="metadata-info">
      <!-- Source Info -->
      <div class="info-section">
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

      <!-- Schema Table -->
      <div v-if="importFields.length > 0" class="schema-section">
        <h4 class="section-title">{{ $t('import.schemaFields') }}</h4>
        <div class="schema-table">
          <div class="schema-header">
            <span class="col-field">{{ $t('export.field') }}</span>
            <span class="col-type">{{ $t('export.type') }}</span>
            <span class="col-state">{{ $t('import.state') }}</span>
          </div>
          <div class="schema-body">
            <div v-for="field in importFields" :key="field.name" class="schema-row">
              <span class="col-field">{{ field.name }}</span>
              <span class="col-type">
                <n-tag :type="getTypeColor(field.type)" size="small">
                  {{ field.type }}
                </n-tag>
              </span>
              <span class="col-state">
                <n-icon size="16" color="#94a3b8">
                  <Locked />
                </n-icon>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Comments -->
      <div v-if="importMetadata.comments" class="comments-section">
        <h4 class="section-title">{{ $t('import.comments') }}</h4>
        <p class="comments-text">{{ importMetadata.comments }}</p>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { DataStructured, Locked } from '@vicons/carbon';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';

const message = useMessage();

const importExportStore = useImportExportStore();
const { importMetadata, importFields, importValidationErrors } = storeToRefs(importExportStore);

const loading = ref(false);

const handleRefreshMetadata = async () => {
  if (!importExportStore.importMetadataFile) {
    message.warning('Please select a metadata file first');
    return;
  }

  loading.value = true;
  try {
    await importExportStore.loadImportMetadata();
    message.success('Metadata loaded successfully');
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loading.value = false;
  }
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

  .validation-errors {
    margin-bottom: 16px;

    .error-list {
      margin: 0;
      padding-left: 20px;

      li {
        margin: 4px 0;
      }
    }
  }

  .empty-state {
    padding: 40px 0;
  }

  .metadata-info {
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
          max-height: 250px;
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
        }

        .col-field {
          flex: 2;
          font-family: monospace;
          font-size: 12px;
        }

        .col-type {
          flex: 1;
        }

        .col-state {
          flex: 0.5;
          text-align: right;
        }
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
