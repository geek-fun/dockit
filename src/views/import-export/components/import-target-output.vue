<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-base h-5 w-5" style="color: #18a058" />
        <span class="step-title">{{ $t('import.targetOutput') }}</span>
      </div>
      <span class="step-badge">{{ $t('export.step') }} 01</span>
    </CardHeader>
    <CardContent>
      <Grid :cols="2" :x-gap="16" :y-gap="16">
        <GridItem>
          <div class="field-label">{{ $t('import.targetDatabase') }}</div>
          <Select
            v-model="inputData.selectedConnection"
            @update:model-value="handleConnectionChange"
          >
            <SelectTrigger>
              <SelectValue :placeholder="$t('connection.selectConnection')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in filteredConnectionOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </GridItem>
        <GridItem>
          <div class="field-label">{{ $t('import.collectionName') }}</div>
          <Select
            v-model="inputData.selectedIndex"
            :disabled="!inputData.selectedConnection || loadingStat.connection"
            @update:model-value="handleIndexChange"
          >
            <SelectTrigger>
              <SelectValue :placeholder="$t('import.selectOrCreateIndex')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in filteredIndexOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <span class="field-hint">
            {{
              importIsNewCollection
                ? $t('import.newCollectionHint')
                : $t('import.existingCollectionHint')
            }}
          </span>
        </GridItem>
      </Grid>

      <!-- Collection Type Indicator -->
      <div v-if="inputData.selectedIndex" class="collection-indicator">
        <Badge :variant="importIsNewCollection ? 'warning' : 'success'">
          {{ importIsNewCollection ? $t('import.newCollection') : $t('import.existingCollection') }}
        </Badge>
        <span class="indicator-text">
          {{
            importIsNewCollection ? $t('import.metadataRequired') : $t('import.noMetadataRequired')
          }}
        </span>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Grid, GridItem } from '@/components/ui/grid';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useImportExportStore,
  useConnectionStore,
  ElasticsearchConnection,
  DynamoDBConnection,
  DatabaseType,
} from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { useMessageService } from '@/composables';

const message = useMessageService();
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
onMounted(async () => {
  if (importConnection.value) {
    inputData.value.selectedConnection = importConnection.value.name;
  }
  if (importTargetIndex.value) {
    inputData.value.selectedIndex = importTargetIndex.value;
  }
  // Fetch connections on mount
  await handleConnectionOpen();
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

const handleConnectionOpen = async () => {
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

const handleIndexOpen = async () => {
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
    // Fetch indices after connection change
    await handleIndexOpen();
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

.step-card .field-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 4px;
  display: block;
}

.step-card .collection-indicator {
  margin-top: 16px;
  padding: 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-card .collection-indicator .indicator-text {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
