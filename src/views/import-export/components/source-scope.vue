<template>
  <n-card class="step-card">
    <template #header>
      <div class="step-header">
        <n-icon size="20" color="#18a058">
          <DataBase />
        </n-icon>
        <span class="step-title">{{ $t('export.sourceScope') }}</span>
      </div>
    </template>
    <template #header-extra>
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </template>

    <n-grid cols="2" x-gap="16" y-gap="16">
      <n-grid-item>
        <div class="field-label">{{ $t('export.sourceDatabase') }}</div>
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
        <div class="field-label">{{ $t('export.collectionName') }}</div>
        <n-select
          v-model:value="selectedIndex"
          :options="filteredIndexOptions"
          :placeholder="$t('connection.selectIndex')"
          :loading="loadingIndex"
          filterable
          remote
          :disabled="!selectedConnection"
          :input-props="inputProps"
          @update:value="handleIndexChange"
          @update:show="handleIndexOpen"
          @search="handleIndexSearch"
        />
      </n-grid-item>
    </n-grid>

    <n-collapse class="advanced-section">
      <n-collapse-item :title="$t('export.advanced')" name="advanced">
        <div class="field-label">{{ $t('export.filterQuery') }}</div>
        <n-input
          v-model:value="filterQuery"
          type="textarea"
          :placeholder="$t('export.filterQueryPlaceholder')"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </n-collapse-item>
    </n-collapse>
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

const exportStore = useImportExportStore();
const { connection, selectedIndex: storeSelectedIndex, filterQuery } = storeToRefs(exportStore);

const selectedConnection = ref<string>('');
const selectedIndex = ref<string>('');
const loadingConnection = ref(false);
const loadingIndex = ref(false);

const connectionSearchQuery = ref('');
const indexSearchQuery = ref('');

// Initialize from store
onMounted(() => {
  if (connection.value) {
    selectedConnection.value = connection.value.name;
  }
  if (storeSelectedIndex.value) {
    selectedIndex.value = storeSelectedIndex.value;
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
  if (!connection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }

  loadingIndex.value = true;
  try {
    await fetchIndices(connection.value);
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
  if (!connection.value) {
    indexOptions.value = [];
    return;
  }

  if (connection.value.type === DatabaseType.ELASTICSEARCH) {
    // Elasticsearch: use indices
    indexOptions.value =
      (connection.value as ElasticsearchConnection)?.indices?.map(index => ({
        label: index.index,
        value: index.index,
      })) ?? [];
  } else if (connection.value.type === DatabaseType.DYNAMODB) {
    // DynamoDB: use table and GSIs
    const dynamoOptions = getDynamoIndexOrTableOption(connection.value as DynamoDBConnection);
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
    exportStore.setConnection(con);
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
  exportStore.setSelectedIndex(value);
};

// Watch for connection changes to update index options
watch(connection, () => {
  if (!connection.value) {
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

  .advanced-section {
    margin-top: 16px;
  }
}
</style>
