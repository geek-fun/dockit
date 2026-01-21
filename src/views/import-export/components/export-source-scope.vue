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
          v-model:value="inputData.selectedConnection"
          :options="filteredConnectionOptions"
          :placeholder="$t('connection.selectConnection')"
          :loading="loadingStat.connection"
          filterable
          remote
          @update:value="handleConnectionChange"
          @update:show="handleConnectionOpen"
          @search="handleConnectionSearch"
        />
      </n-grid-item>
      <n-grid-item>
        <div class="field-label">{{ $t('export.collectionName') }}</div>
        <n-select
          v-model:value="inputData.selectedIndex"
          :options="filteredIndexOptions"
          :placeholder="$t('connection.selectIndex')"
          :loading="loadingStat.index"
          filterable
          remote
          :disabled="!inputData.selectedConnection"
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
import { DataBase } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import {
  DatabaseType,
  DynamoDBConnection,
  ElasticsearchConnection,
  useConnectionStore,
  useImportExportStore,
} from '../../../store';

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, freshConnection, getDynamoIndexOrTableOption } =
  connectionStore;
const { connections } = storeToRefs(connectionStore);

const exportStore = useImportExportStore();
const { setConnection } = exportStore;
const { connection, selectedIndex, filterQuery } = storeToRefs(exportStore);

const inputData = ref({
  selectedConnection: '',
  selectedIndex: '',
  connectionSearchQuery: '',
  indexSearchQuery: '',
});
const loadingStat = ref({
  connection: false,
  index: false,
});

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const filteredConnectionOptions = computed(() => {
  if (!inputData.value.connectionSearchQuery) {
    return connectionOptions.value;
  }
  const query = inputData.value.connectionSearchQuery.toLowerCase();
  return connectionOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const indexOptions = ref<Array<{ label: string; value: string }>>([]);

const filteredIndexOptions = computed(() => {
  if (!inputData.value.indexSearchQuery) {
    return indexOptions.value;
  }
  const query = inputData.value.indexSearchQuery.toLowerCase();
  return indexOptions.value
    .filter(option => option.value.toLowerCase().includes(query))
    .sort((a, b) => a.value.localeCompare(b.value));
});

const handleConnectionSearch = (query: string) => {
  inputData.value.connectionSearchQuery = query;
};

const handleIndexSearch = (query: string) => {
  inputData.value.indexSearchQuery = query;
};

const handleConnectionOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  loadingStat.value.connection = true;
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
    loadingStat.value.connection = false;
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

  loadingStat.value.index = true;
  try {
    await fetchIndices(connection.value);
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
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingStat.value.index = false;
  }
};

const handleConnectionChange = async (value: string) => {
  const con = connections.value.find(({ name }) => name === value);
  if (!con) return;
  loadingStat.value.connection = true;
  try {
    await freshConnection(con);
    setConnection(con);
    inputData.value.selectedConnection = value;
    inputData.value.selectedIndex = '';
    indexOptions.value = [];
    inputData.value.indexSearchQuery = '';
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingStat.value.connection = false;
  }
};

const handleIndexChange = (value: string) => {
  loadingStat.value.index = true;
  try {
    inputData.value.selectedIndex = value;
    exportStore.setSelectedIndex(value);
  } finally {
    loadingStat.value.index = false;
  }
};

// Initialize from store
onMounted(async () => {
  if (connection.value) {
    await handleConnectionChange(connection.value.name);
    inputData.value.selectedConnection = connection.value.name;
  }
  if (selectedIndex.value) {
    handleIndexChange(selectedIndex.value);
  }
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
