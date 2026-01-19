<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DataStructured />
        </n-icon>
        <div class="step-title-container">
          <span class="step-title">{{ $t('export.schemaStructure') }}</span>
          <span v-if="selectedIndex" class="step-subtitle">{{ selectedIndex }} schema</span>
        </div>
      </div>
    </template>
    <template #header-extra>
      <div class="header-extra">
        <n-button text type="primary" @click="handleRefresh" :loading="loading">
          {{ $t('export.refresh') }}
        </n-button>
        <span class="step-badge">{{ $t('export.step') }} 02</span>
      </div>
    </template>

    <div v-if="fields.length === 0" class="empty-state">
      <n-empty :description="$t('export.selectSourceFirst')">
        <template #icon>
          <n-icon size="48">
            <DataStructured />
          </n-icon>
        </template>
      </n-empty>
    </div>

    <div v-else class="schema-table">
      <div class="schema-header">
        <span class="col-field">{{ $t('export.field') }}</span>
        <span class="col-type">{{ $t('export.type') }}</span>
        <span class="col-sample">{{ $t('export.sampleValue') }}</span>
        <span class="col-include">{{ $t('export.includeInExport') }}</span>
      </div>
      <div class="schema-body">
        <div v-for="field in fields" :key="field.name" class="schema-row">
          <span class="col-field">{{ field.name }}</span>
          <span class="col-type">
            <n-tag :type="getTypeColor(field.type)" size="small">
              {{ field.type }}
            </n-tag>
          </span>
          <span class="col-sample">{{ field.sampleValue || '-' }}</span>
          <span class="col-include">
            <n-switch
              :value="field.includeInExport"
              @update:value="() => toggleField(field.name)"
            />
          </span>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { DataStructured } from '@vicons/carbon';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const lang = useLang();

const exportStore = useImportExportStore();
const { fields, selectedIndex, connection } = storeToRefs(exportStore);

const loading = ref(false);

const handleRefresh = async () => {
  if (!connection.value || !selectedIndex.value) {
    message.warning(lang.t('export.selectSourceFirst'));
    return;
  }

  loading.value = true;
  try {
    await exportStore.fetchSchemaAndSamples();
    message.success(lang.t('export.schemaLoaded'));
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

const toggleField = (fieldName: string) => {
  exportStore.toggleFieldInclusion(fieldName);
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

// Auto-fetch schema when index changes
watch(
  [connection, selectedIndex],
  async ([newConnection, newIndex]) => {
    if (newConnection && newIndex) {
      loading.value = true;
      try {
        await exportStore.fetchSchemaAndSamples();
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
    }
  },
  { immediate: false },
);
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

  .schema-table {
    .schema-header {
      display: flex;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-color-3);
      text-transform: uppercase;
      font-weight: 500;
    }

    .schema-body {
      max-height: 300px;
      overflow-y: auto;
    }

    .schema-row {
      display: flex;
      padding: 12px 0;
      border-bottom: 1px solid var(--border-color);
      align-items: center;

      &:last-child {
        border-bottom: none;
      }
    }

    .col-field {
      flex: 2;
      font-weight: 500;
    }

    .col-type {
      flex: 1;
    }

    .col-sample {
      flex: 2;
      color: var(--text-color-3);
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .col-include {
      flex: 1;
      text-align: right;
    }
  }
}
</style>
