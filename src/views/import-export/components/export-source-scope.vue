<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-base h-5 w-5" style="color: #18a058" />
        <span class="step-title">{{ $t('export.sourceScope') }}</span>
      </div>
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </CardHeader>
    <CardContent>
      <Grid :cols="2" :x-gap="16" :y-gap="16">
        <GridItem>
          <div class="field-label">{{ $t('export.sourceDatabase') }}</div>
          <Select
            v-model="inputData.selectedConnection"
            @update:model-value="handleConnectionChange"
            @update:open="handleConnectionOpen"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="$t('connection.selectConnection')" />
            </SelectTrigger>
            <SelectContent>
              <div v-if="loadingStat.connection" class="flex items-center justify-center py-4">
                <Spinner class="h-4 w-4" />
              </div>
              <template v-else>
                <SelectItem
                  v-for="option in filteredConnectionOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </template>
            </SelectContent>
          </Select>
        </GridItem>
        <GridItem>
          <div class="field-label">{{ $t('export.collectionName') }}</div>
          <Select
            v-model="inputData.selectedIndex"
            :disabled="!inputData.selectedConnection || loadingStat.connection"
            @update:model-value="handleIndexChange"
            @update:open="handleIndexOpen"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="$t('connection.selectIndex')" />
            </SelectTrigger>
            <SelectContent>
              <div v-if="loadingStat.index" class="flex items-center justify-center py-4">
                <Spinner class="h-4 w-4" />
              </div>
              <template v-else>
                <SelectItem
                  v-for="option in filteredIndexOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </template>
            </SelectContent>
          </Select>
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
        </CollapseItem>
      </Collapse>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Grid, GridItem } from '@/components/ui/grid';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Collapse, CollapseItem } from '@/components/ui/collapse';
import { Spinner } from '@/components/ui/spinner';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import {
  DatabaseType,
  DynamoDBConnection,
  ElasticsearchConnection,
  useConnectionStore,
  useImportExportStore,
} from '../../../store';
import { useMessageService } from '@/composables';
import { storeToRefs } from 'pinia';

const message = useMessageService();
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

// Note: handleConnectionSearch and handleIndexSearch are kept for future use
// if search functionality is re-added to the Select component
void handleConnectionSearch;
void handleIndexSearch;

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
    if (connection.value.type === DatabaseType.ELASTICSEARCH) {
      // fetchIndices hits the server and updates connectionStore.connections[] in-place by id.
      // connection.value (exportStore copy) is a separate object and is not mutated,
      // so look up the freshly updated entry from the connectionStore afterwards.
      await fetchIndices(connection.value);
      const updatedCon =
        connections.value.find(c => c.id === connection.value?.id) ?? connection.value;
      indexOptions.value =
        (updatedCon as ElasticsearchConnection)?.indices?.map(index => ({
          label: index.index,
          value: index.index,
        })) ?? [];
    } else if (connection.value.type === DatabaseType.DYNAMODB) {
      // DynamoDB metadata is already populated by freshConnection — no extra fetch needed.
      // connection.value holds the refreshed object; connectionStore.connections[] is NOT updated
      // by freshConnection, so we must NOT use the connections.value lookup here.
      const dynamoOptions = getDynamoIndexOrTableOption(connection.value as DynamoDBConnection);
      const tableOption = dynamoOptions.find(opt => opt.label.startsWith('Table -'));
      indexOptions.value = tableOption
        ? [
            {
              label: (connection.value as DynamoDBConnection).tableName,
              value: tableOption.value,
            },
          ]
        : [];
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
  loadingStat.value.connection = true;
  try {
    const refreshed = await freshConnection(con);
    setConnection(refreshed);
    inputData.value.selectedConnection = value;
    inputData.value.selectedIndex = '';
    indexOptions.value = [];
    inputData.value.indexSearchQuery = '';
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

.step-card .advanced-section {
  margin-top: 16px;
}
</style>
