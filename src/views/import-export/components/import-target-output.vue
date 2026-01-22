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
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </template>

    <n-grid cols="2" x-gap="16" y-gap="16">
      <n-grid-item>
        <div class="field-label">{{ $t('import.targetDatabase') }}</div>
        <n-select
          v-model:value="inputData.selectedConnection"
          :options="filteredConnectionOptions"
          :placeholder="$t('connection.selectConnection')"
          :loading="loadingStat.connection"
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
          v-model:value="inputData.selectedIndex"
          :options="filteredIndexOptions"
          :placeholder="$t('import.selectOrCreateIndex')"
          :loading="loadingStat.index"
          filterable
          remote
          tag
          :disabled="!inputData.selectedConnection || loadingStat.connection"
          :input-props="inputProps"
          @update:value="handleIndexChange"
          @update:show="handleIndexOpen"
          @search="handleIndexSearch"
        />
        <span class="field-hint">
          {{
            importIsNewCollection
              ? $t('import.newCollectionHint')
              : $t('import.existingCollectionHint')
          }}
        </span>
      </n-grid-item>
    </n-grid>

    <!-- Collection Type Indicator -->
    <div v-if="inputData.selectedIndex" class="collection-indicator">
      <n-tag :type="importIsNewCollection ? 'warning' : 'success'" size="small">
        {{ importIsNewCollection ? $t('import.newCollection') : $t('import.existingCollection') }}
      </n-tag>
      <span class="indicator-text">
        {{
          importIsNewCollection ? $t('import.metadataRequired') : $t('import.noMetadataRequired')
        }}
      </span>
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
const { importConnection, importTargetIndex, importIsNewCollection } =
  storeToRefs(importExportStore);

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

const indexOptions = ref<Array<{ label: string; value: string }>>([]);
const currentExistingIndices = ref<string[]>([]);

// Initialize from store
onMounted(() => {
  if (importConnection.value) {
    inputData.value.selectedConnection = importConnection.value.name;
  }
  if (importTargetIndex.value) {
    inputData.value.selectedIndex = importTargetIndex.value;
  }
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
  if (!importConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }

  loadingStat.value.index = true;
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
    loadingStat.value.index = false;
  }
};

const updateIndexOptions = () => {
  if (!importConnection.value) {
    indexOptions.value = [];
    currentExistingIndices.value = [];
    return;
  }

  if (importConnection.value.type === DatabaseType.ELASTICSEARCH) {
    const indices =
      (importConnection.value as ElasticsearchConnection)?.indices?.map(index => index.index) ?? [];
    currentExistingIndices.value = indices;
    indexOptions.value = indices.map(index => ({
      label: index,
      value: index,
    }));
  } else if (importConnection.value.type === DatabaseType.DYNAMODB) {
    // DynamoDB: only show table name (not GSIs)
    const dynamoOptions = getDynamoIndexOrTableOption(importConnection.value as DynamoDBConnection);
    // Filter to only include the table (first option which starts with "Table -")
    const tableOption = dynamoOptions.find(opt => opt.label.startsWith('Table -'));
    if (tableOption) {
      const tableName = (importConnection.value as DynamoDBConnection).tableName;
      currentExistingIndices.value = [tableOption.value];
      indexOptions.value = [
        {
          label: tableName,
          value: tableOption.value,
        },
      ];
    } else {
      currentExistingIndices.value = [];
      indexOptions.value = [];
    }
  }
};

const handleConnectionChange = async (value: string) => {
  const con = connections.value.find(({ name }) => name === value);
  if (!con) return;
  loadingStat.value.connection = true;
  try {
    await freshConnection(con);
    importExportStore.setImportConnection(con);
    inputData.value.selectedConnection = value;
    inputData.value.selectedIndex = '';
    indexOptions.value = [];
    inputData.value.indexSearchQuery = '';
    currentExistingIndices.value = [];
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
    importExportStore.setImportTargetIndex(value, currentExistingIndices.value);
  } finally {
    loadingStat.value.index = false;
  }
};
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

  .collection-indicator {
    margin-top: 16px;
    padding: 12px;
    background: var(--card-color);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 12px;

    .indicator-text {
      font-size: 12px;
      color: var(--text-color-2);
    }
  }
}
</style>
