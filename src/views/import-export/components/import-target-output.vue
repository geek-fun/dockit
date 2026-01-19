<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DataBase />
        </n-icon>
        <span class="step-title">{{ $t('import.targetOutput') }}</span>
      </div>
    </template>
    <template #header-extra>
      <span class="step-badge">{{ $t('export.step') }} 03</span>
    </template>

    <n-grid cols="2" x-gap="16" y-gap="16">
      <n-grid-item>
        <div class="field-label">{{ $t('import.targetDatabase') }}</div>
        <n-select
          v-model:value="selectedConnection"
          :options="filteredConnectionOptions"
          :placeholder="$t('connection.selectConnection')"
          :loading="loadingConnection"
          filterable
          remote
          :input-props="inputProps"
          @update:value="handleConnectionChange"
          @update:show="handleConnectionOpen"
          @search="handleConnectionSearch"
        />
      </n-grid-item>
      <n-grid-item>
        <div class="field-label">{{ $t('import.collectionName') }}</div>
        <n-select
          v-model:value="selectedIndex"
          :options="filteredIndexOptions"
          :placeholder="$t('connection.selectIndex')"
          :loading="loadingIndex"
          filterable
          remote
          tag
          :disabled="!selectedConnection"
          :input-props="inputProps"
          @update:value="handleIndexChange"
          @update:show="handleIndexOpen"
          @search="handleIndexSearch"
        />
        <span class="field-hint">{{ $t('import.indexHint') }}</span>
      </n-grid-item>
    </n-grid>

    <!-- Database Compatibility Warning -->
    <div v-if="compatibilityWarning" class="compatibility-warning">
      <n-alert type="warning" :title="$t('import.compatibilityWarning')">
        {{ compatibilityWarning }}
      </n-alert>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { DataBase } from '@vicons/carbon';
import {
  useImportExportStore,
  useConnectionStore,
  ElasticsearchConnection,
  DynamoDBConnection,
  DatabaseType,
} from '../../../store';
import { CustomError, inputProps } from '../../../common';
import { useLang } from '../../../lang';

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, freshConnection, getDynamoIndexOrTableOption } =
  connectionStore;
const { connections } = storeToRefs(connectionStore);

const importExportStore = useImportExportStore();
const { importConnection, importTargetIndex, importMetadata } = storeToRefs(importExportStore);

const selectedConnection = ref<string>('');
const selectedIndex = ref<string>('');
const loadingConnection = ref(false);
const loadingIndex = ref(false);

const connectionSearchQuery = ref('');
const indexSearchQuery = ref('');

// Initialize from store
onMounted(() => {
  if (importConnection.value) {
    selectedConnection.value = importConnection.value.name;
  }
  if (importTargetIndex.value) {
    selectedIndex.value = importTargetIndex.value;
  }
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const filteredConnectionOptions = computed(() => {
  if (!connectionSearchQuery.value) {
    return connectionOptions.value;
  }
  const query = connectionSearchQuery.value.toLowerCase();
  return connectionOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const indexOptions = ref<Array<{ label: string; value: string }>>([]);

const filteredIndexOptions = computed(() => {
  if (!indexSearchQuery.value) {
    return indexOptions.value;
  }
  const query = indexSearchQuery.value.toLowerCase();
  return indexOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const compatibilityWarning = computed(() => {
  if (!importMetadata.value || !importConnection.value) return null;

  const sourceDbType = importMetadata.value.source.dbType.toLowerCase();
  const targetDbType = importConnection.value.type.toLowerCase();

  if (sourceDbType !== targetDbType) {
    return `Source database type (${sourceDbType}) does not match target (${targetDbType}). Data may not import correctly.`;
  }

  return null;
});

const handleConnectionSearch = (query: string) => {
  connectionSearchQuery.value = query;
};

const handleIndexSearch = (query: string) => {
  indexSearchQuery.value = query;
};

const handleConnectionOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  loadingConnection.value = true;
  try {
    await fetchConnections();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingConnection.value = false;
  }
};

const handleIndexOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  if (!importConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }

  loadingIndex.value = true;
  try {
    await fetchIndices(importConnection.value);
    updateIndexOptions();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingIndex.value = false;
  }
};

const updateIndexOptions = () => {
  if (!importConnection.value) {
    indexOptions.value = [];
    return;
  }

  if (importConnection.value.type === DatabaseType.ELASTICSEARCH) {
    indexOptions.value =
      (importConnection.value as ElasticsearchConnection)?.indices?.map(index => ({
        label: index.index,
        value: index.index,
      })) ?? [];
  } else if (importConnection.value.type === DatabaseType.DYNAMODB) {
    const dynamoOptions = getDynamoIndexOrTableOption(importConnection.value as DynamoDBConnection);
    indexOptions.value = dynamoOptions.map(opt => ({
      label: opt.label,
      value: opt.value,
    }));
  }
};

const handleConnectionChange = async (value: string) => {
  const con = connections.value.find(({ name }) => name === value);
  if (!con) return;

  try {
    await freshConnection(con);
    importExportStore.setImportConnection(con);
    selectedIndex.value = '';
    indexOptions.value = [];
    indexSearchQuery.value = '';
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

const handleIndexChange = (value: string) => {
  importExportStore.setImportTargetIndex(value);
};

// Watch for connection changes to update index options
watch(importConnection, () => {
  if (!importConnection.value) {
    indexOptions.value = [];
    selectedIndex.value = '';
    indexSearchQuery.value = '';
    return;
  }
  updateIndexOptions();
});
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

  .field-label {
    font-size: 12px;
    color: var(--text-color-3);
    margin-bottom: 8px;
    text-transform: uppercase;
    font-weight: 500;
  }

  .field-hint {
    font-size: 11px;
    color: var(--text-color-3);
    margin-top: 4px;
    display: block;
  }

  .compatibility-warning {
    margin-top: 16px;
  }
}
</style>
