<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-base h-5 w-5" style="color: #18a058" />
        <span class="step-title">{{ $t('export.sourceScope') }}</span>
        <span v-if="selectionSummary" class="selection-summary">{{ selectionSummary }}</span>
      </div>
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </CardHeader>
    <CardContent>
      <div v-if="loadingStat.connecting" class="connecting-overlay">
        <Spinner class="h-5 w-5" />
        <span class="connecting-label">
          {{ $t('connection.connecting', { name: inputData.selectedConnection }) }}
        </span>
      </div>
      <Grid :cols="connection?.type === DatabaseType.MONGODB ? 3 : 2" :x-gap="16" :y-gap="16">
        <GridItem>
          <div class="field-label">{{ $t('export.sourceDatabase') }}</div>
          <SearchableSelect
            :model-value="inputData.selectedConnection"
            :options="connectionOptions"
            :loading="loadingStat.connection"
            :search-threshold="0"
            :placeholder="$t('connection.selectConnection')"
            class="w-full"
            @update:model-value="handleConnectionChange"
            @open="isOpen => isOpen && handleConnectionOpen(true)"
          />
        </GridItem>
        <GridItem v-if="connection?.type === DatabaseType.MONGODB">
          <div class="field-label">{{ $t('export.exportDatabase') }}</div>
          <SearchableSelect
            :model-value="exportDatabase"
            :options="databaseOptions"
            :loading="loadingStat.database"
            :search-threshold="0"
            :placeholder="$t('export.exportDatabasePlaceholder')"
            class="w-full"
            @update:model-value="handleDatabaseChange"
            @open="isOpen => isOpen && handleDatabaseOpen(true)"
          />
        </GridItem>
        <GridItem>
          <div class="field-label">{{ $t('export.collectionName') }}</div>
          <SearchableSelect
            :model-value="inputData.selectedIndex"
            :options="indexOptions"
            :loading="loadingStat.index"
            :search-threshold="0"
            :disabled="
              !inputData.selectedConnection || loadingStat.connection || loadingStat.connecting
            "
            :placeholder="$t('connection.selectIndex')"
            class="w-full"
            @update:model-value="handleIndexChange"
            @open="isOpen => isOpen && handleIndexOpen(true)"
          />
        </GridItem>
      </Grid>

      <Collapse class="advanced-section">
        <CollapseItem :title="$t('export.advanced')" name="advanced">
          <div class="field-label">{{ $t('export.filterQuery') }}</div>
          <textarea
            v-model="filterQuery"
            class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            :placeholder="$t('export.filterQueryPlaceholder')"
            rows="3"
          />
          <template v-if="connection?.type === DatabaseType.MONGODB">
            <div class="field-label">{{ $t('export.sortQuery') }}</div>
            <textarea
              v-model="sortQuery"
              class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              :placeholder="$t('export.sortQueryPlaceholder')"
              rows="3"
            />
          </template>
        </CollapseItem>
      </Collapse>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Grid, GridItem } from '@/components/ui/grid';
import { Collapse, CollapseItem } from '@/components/ui/collapse';
import { Spinner } from '@/components/ui/spinner';
import { SearchableSelect } from '@/components/ui/combobox';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { mongoApi } from '../../../datasources';
import {
  DatabaseType,
  DynamoDBConnection,
  MongoDBConnection,
  SearchConnection,
  isSearchConnection,
  useConnectionStore,
  useImportExportStore,
} from '../../../store';
import { useMessageService } from '@/composables';
import { storeToRefs } from 'pinia';

const message = useMessageService();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, freshConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const exportStore = useImportExportStore();
const { setConnection } = exportStore;
const { connection, selectedIndex, filterQuery, sortQuery, exportDatabase } =
  storeToRefs(exportStore);

const inputData = ref({
  selectedConnection: '',
  selectedIndex: '',
});
const loadingStat = ref({
  connection: false,
  connecting: false,
  index: false,
  database: false,
});

const selectionSummary = computed(() => {
  const conn = inputData.value.selectedConnection;
  const idx = inputData.value.selectedIndex;
  if (conn && idx) return `${conn} → ${idx}`;
  if (conn) return conn;
  return '';
});

const connectionOptions = computed(() =>
  connections.value
    .map(({ name }) => ({ label: name, value: name }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

const indexOptions = ref<Array<{ label: string; value: string }>>([]);
const databaseOptions = ref<Array<{ label: string; value: string }>>([]);

const handleConnectionOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  loadingStat.value.connection = true;
  try {
    await fetchConnections();
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
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
    if (connection.value && isSearchConnection(connection.value)) {
      // fetchIndices hits the server and updates connectionStore.connections[] in-place by id.
      // connection.value (exportStore copy) is a separate object and is not mutated,
      // so look up the freshly updated entry from the connectionStore afterwards.
      await fetchIndices(connection.value);
      const updatedCon =
        connections.value.find(c => c.id === connection.value?.id) ?? connection.value;
      const indices = (updatedCon as SearchConnection)?.indices ?? [];
      const sortedIndices = indices
        .map(index => ({ label: index.index, value: index.index }))
        .sort((a, b) => {
          const aIsSystem = a.label.startsWith('.');
          const bIsSystem = b.label.startsWith('.');
          if (aIsSystem !== bIsSystem) return aIsSystem ? 1 : -1;
          return a.label.localeCompare(b.label);
        });
      indexOptions.value = sortedIndices;
    } else if (connection.value?.type === DatabaseType.DYNAMODB) {
      // DynamoDB metadata is already populated by freshConnection — no extra fetch needed.
      const dynamoConn = connection.value as DynamoDBConnection;
      indexOptions.value =
        dynamoConn.tables
          ?.map(t => ({ label: t.name, value: t.name }))
          .sort((a, b) => a.label.localeCompare(b.label)) ?? [];
    } else if (connection.value?.type === DatabaseType.MONGODB) {
      if (exportDatabase.value) {
        const mongoConn = connection.value as MongoDBConnection;
        const result = await mongoApi.listCollections(mongoConn, exportDatabase.value);
        if (result.success && result.collections) {
          indexOptions.value = result.collections
            .map(c => ({ label: c.name, value: c.name }))
            .sort((a, b) => a.label.localeCompare(b.label));
        } else {
          indexOptions.value = [];
        }
      } else {
        // Fall back to cached collections if no database selected yet
        const mongoConn = connection.value as MongoDBConnection;
        const collections = mongoConn.collections ?? [];
        indexOptions.value = collections
          .map(c => ({ label: c.name, value: c.name }))
          .sort((a, b) => a.label.localeCompare(b.label));
      }
    }
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
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
  exportStore.detachActiveTask('export');
  loadingStat.value.connecting = true;
  try {
    const refreshed = await freshConnection(con);
    setConnection(refreshed);
    inputData.value.selectedConnection = value;
    inputData.value.selectedIndex = '';
    indexOptions.value = [];
    exportStore.setExportDatabase('');
    databaseOptions.value = [];
    // Fetch indices immediately after connection change
    await handleIndexOpen(true);
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingStat.value.connecting = false;
  }
};

const handleDatabaseOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  if (!connection.value) return;
  loadingStat.value.database = true;
  try {
    const result = await mongoApi.listDatabases(connection.value as MongoDBConnection);
    if (result.success && result.databases) {
      const systemDbs = new Set(['admin', 'config', 'local']);
      databaseOptions.value = result.databases
        .map(db => ({ label: db.name, value: db.name }))
        .sort((a, b) => {
          const aIsSystem = systemDbs.has(a.label);
          const bIsSystem = systemDbs.has(b.label);
          if (aIsSystem !== bIsSystem) return aIsSystem ? 1 : -1;
          return a.label.localeCompare(b.label);
        });
    }
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loadingStat.value.database = false;
  }
};

const handleDatabaseChange = async (db: string) => {
  exportStore.detachActiveTask('export');
  exportStore.setExportDatabase(db);
  if (!connection.value) return;
  loadingStat.value.index = true;
  try {
    const result = await mongoApi.listCollections(connection.value as MongoDBConnection, db);
    if (result.success && result.collections) {
      indexOptions.value = result.collections
        .map(c => ({ label: c.name, value: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } else {
      indexOptions.value = [];
    }
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    indexOptions.value = [];
  } finally {
    loadingStat.value.index = false;
  }
  inputData.value.selectedIndex = '';
};

const handleIndexChange = (value: string) => {
  exportStore.detachActiveTask('export');
  inputData.value.selectedIndex = value;
  exportStore.setSelectedIndex(value);
};

// Initialize from store
onMounted(async () => {
  // Always refresh the connections list first
  await fetchConnections();
  if (connection.value) {
    inputData.value.selectedConnection = connection.value.name;
    // Repopulate indexOptions from stored connection without resetting selectedIndex
    await handleIndexOpen(true);
    // Restore the previously selected index
    if (selectedIndex.value) {
      inputData.value.selectedIndex = selectedIndex.value;
    }
  }
});

watch(connection, newConn => {
  if (newConn) {
    inputData.value.selectedConnection = newConn.name;
  }
});

watch(selectedIndex, newIdx => {
  inputData.value.selectedIndex = newIdx;
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

.step-card .step-header .selection-summary {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 400;
  padding: 2px 8px;
  border-radius: 4px;
  background: hsl(var(--muted));
}

.step-card .connecting-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  border-radius: 6px;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.step-card .connecting-label {
  font-size: 13px;
}

.step-card .field-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 8px;
  text-transform: uppercase;
  font-weight: 500;
}

.step-card .advanced-section {
  margin-top: 16px;
}
</style>
