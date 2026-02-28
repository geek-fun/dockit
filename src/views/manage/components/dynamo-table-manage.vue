<template>
  <div class="dynamo-manage-container">
    <div v-if="refreshLoading" class="refresh-overlay">
      <Spinner size="lg" />
      <span class="refresh-text">{{ $t('manage.dynamo.refresh') }}...</span>
    </div>
    <div :class="{ 'opacity-50 pointer-events-none': refreshLoading }">
      <!-- Metrics Cards Section -->
      <section class="metrics-section">
        <div class="metrics-grid">
          <!-- Status Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.status') }}</span>
              <div class="metric-value status-value">
                <span class="status-indicator" :class="statusClass"></span>
                <span class="status-text" :class="statusClass">{{ tableInfo?.status || '-' }}</span>
              </div>
            </CardContent>
          </Card>

          <!-- Item Count Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.itemCount') }}</span>
              <span class="metric-value">{{ formatNumber(tableInfo?.itemCount) }}</span>
            </CardContent>
          </Card>

          <!-- Table Size Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.tableSize') }}</span>
              <span class="metric-value">{{ formatBytes(tableInfo?.sizeBytes) }}</span>
            </CardContent>
          </Card>

          <!-- Mode Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.mode') }}</span>
              <span class="metric-value-small">{{ billingMode }}</span>
            </CardContent>
          </Card>

          <!-- PITR Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.pitr') }}</span>
              <div class="metric-value-status">
                <span v-if="pitrEnabled" class="i-carbon-checkmark-filled h-4 w-4 text-green-500" />
                <span v-else class="i-carbon-close-filled h-4 w-4 text-red-500" />
                <span :class="pitrEnabled ? 'status-enabled' : 'status-disabled'">
                  {{ pitrEnabled ? $t('manage.dynamo.enabled') : $t('manage.dynamo.disabled') }}
                </span>
              </div>
            </CardContent>
          </Card>

          <!-- TTL Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.dynamo.ttl') }}</span>
              <div class="ttl-value">
                <span :class="ttlEnabled ? 'status-enabled' : 'status-disabled'">
                  {{ ttlEnabled ? $t('manage.dynamo.enabled') : $t('manage.dynamo.disabled') }}
                </span>
                <span v-if="ttlEnabled && ttlAttribute" class="ttl-attribute">
                  {{ ttlAttribute }}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- Performance & Capacity Section -->
      <section class="performance-section">
        <Card class="performance-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-chart-line-data h-4 w-4" />
                <span>{{ $t('manage.dynamo.performanceCapacity') }}</span>
              </div>
              <span class="time-range">{{ $t('manage.dynamo.last24Hours') }}</span>
            </div>
          </CardHeader>
          <CardContent>
            <!-- CloudWatch metrics not available message -->
            <Alert
              v-if="!metricsAvailable && metricsMessage && !metricsLoading"
              variant="info"
              class="mb-4"
            >
              <AlertDescription>{{ metricsMessage }}</AlertDescription>
            </Alert>

            <div v-if="metricsLoading" class="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
            <div v-else class="performance-content">
              <div class="chart-section">
                <div class="chart-header">
                  <span class="chart-title">{{ $t('manage.dynamo.consumedCapacity') }}</span>
                  <div class="chart-legend">
                    <div class="legend-item">
                      <span class="legend-color read"></span>
                      <span>{{ $t('manage.dynamo.read') }}</span>
                    </div>
                    <div class="legend-item">
                      <span class="legend-color write"></span>
                      <span>{{ $t('manage.dynamo.write') }}</span>
                    </div>
                  </div>
                </div>
                <div class="chart-placeholder">
                  <svg class="chart-svg" viewBox="0 0 400 100" preserveAspectRatio="none">
                    <path
                      d="M0 20 H400 M0 40 H400 M0 60 H400 M0 80 H400"
                      stroke="#f1f5f9"
                      stroke-width="1"
                    />
                    <polyline
                      fill="none"
                      :points="readChartPoints"
                      stroke="#3b82f6"
                      stroke-width="2"
                      vector-effect="non-scaling-stroke"
                    />
                    <polyline
                      fill="none"
                      :points="writeChartPoints"
                      stroke="#fb923c"
                      stroke-width="2"
                      vector-effect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>
              <div class="utilization-section">
                <!-- RCU Utilization -->
                <div class="utilization-item">
                  <div class="utilization-gauge">
                    <svg class="gauge-svg" viewBox="0 0 36 36">
                      <path
                        class="gauge-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        stroke-width="3"
                      />
                      <path
                        class="gauge-fill rcu"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#3b82f6"
                        stroke-width="3"
                        :stroke-dasharray="`${rcuUtilization}, 100`"
                      />
                    </svg>
                    <span class="gauge-value">{{ rcuUtilization }}%</span>
                  </div>
                  <div class="utilization-info">
                    <span class="utilization-label">{{ $t('manage.dynamo.rcuUtilization') }}</span>
                    <span class="utilization-detail">Prov: {{ provisionedRcu }} RCU</span>
                  </div>
                </div>
                <!-- WCU Utilization -->
                <div class="utilization-item">
                  <div class="utilization-gauge">
                    <svg class="gauge-svg" viewBox="0 0 36 36">
                      <path
                        class="gauge-bg"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#e5e7eb"
                        stroke-width="3"
                      />
                      <path
                        class="gauge-fill wcu"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#fb923c"
                        stroke-width="3"
                        :stroke-dasharray="`${wcuUtilization}, 100`"
                      />
                    </svg>
                    <span class="gauge-value">{{ wcuUtilization }}%</span>
                  </div>
                  <div class="utilization-info">
                    <span class="utilization-label">{{ $t('manage.dynamo.wcuUtilization') }}</span>
                    <span class="utilization-detail">Prov: {{ provisionedWcu }} WCU</span>
                  </div>
                </div>
                <!-- Throttled Events -->
                <div class="throttled-events">
                  <span class="throttled-label">{{ $t('manage.dynamo.throttledEvents') }}</span>
                  <span class="throttled-value">{{ throttledEvents }}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- Global Secondary Indexes Section -->
      <section class="indexes-section">
        <Card class="indexes-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-table-split h-4 w-4" />
                <span>{{ $t('manage.dynamo.gsiTitle') }}</span>
              </div>
              <Button size="sm" @click="handleCreateIndex">
                {{ $t('manage.dynamo.createIndex') }}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="globalSecondaryIndexes.length > 0" class="table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{{ lang.t('manage.dynamo.indexName') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.partitionKey') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.sortKey') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.projection') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.size') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.itemCount') }}</TableHead>
                    <TableHead>{{ lang.t('manage.dynamo.indexStatus') }}</TableHead>
                    <TableHead class="w-20">{{ lang.t('manage.dynamo.actions') }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="row in globalSecondaryIndexes" :key="row.name">
                    <TableCell class="font-medium">{{ row.name }}</TableCell>
                    <TableCell>{{ getPartitionKey(row) }}</TableCell>
                    <TableCell>{{ getSortKey(row) }}</TableCell>
                    <TableCell>{{ getProjection(row) }}</TableCell>
                    <TableCell>{{ formatIndexSize(row) }}</TableCell>
                    <TableCell>{{ formatIndexItemCount(row) }}</TableCell>
                    <TableCell>
                      <Badge
                        :variant="row.status?.toUpperCase() === 'ACTIVE' ? 'success' : 'warning'"
                      >
                        {{ row.status?.toUpperCase() || 'ACTIVE' }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div class="action-buttons">
                        <Button variant="ghost" size="icon" @click="handleDeleteIndex(row)">
                          <span class="i-carbon-trash-can h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            <Empty v-else :description="$t('manage.dynamo.noGsi')" />
          </CardContent>
        </Card>
      </section>

      <!-- Table Settings Section -->
      <section class="settings-section">
        <Card class="settings-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-settings-adjust h-4 w-4" />
                <span>{{ $t('manage.dynamo.tableSettings') }}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div class="settings-grid">
              <!-- Streams Setting -->
              <div
                class="setting-item clickable"
                @click="message.info($t('manage.dynamo.comingSoon'))"
              >
                <div class="setting-header">
                  <span class="setting-label">{{ $t('manage.dynamo.streams') }}</span>
                  <Switch :checked="streamsEnabled" @click.stop />
                </div>
                <span class="setting-value">{{ streamsViewType || '-' }}</span>
              </div>
              <!-- Encryption Setting -->
              <div class="setting-item">
                <div class="setting-header">
                  <span class="setting-label">{{ $t('manage.dynamo.encryption') }}</span>
                  <span class="i-carbon-locked h-4 w-4" />
                </div>
                <span class="setting-value">{{ encryptionType }}</span>
              </div>
              <!-- Table Class Setting -->
              <div
                class="setting-item clickable"
                @click="message.info($t('manage.dynamo.comingSoon'))"
              >
                <div class="setting-header">
                  <span class="setting-label">{{ $t('manage.dynamo.tableClass') }}</span>
                  <span class="i-carbon-data-table h-4 w-4" />
                </div>
                <span class="setting-value">{{ tableClass }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- Modals -->
      <delete-index-modal
        v-model:show="showDeleteIndexModal"
        :index-name="selectedIndex?.name || ''"
        :table-name="dynamoConnection?.tableName || ''"
        @deleted="handleIndexDeleted"
      />

      <create-index-modal
        v-model:show="showCreateIndexModal"
        :table-name="dynamoConnection?.tableName || ''"
        @created="handleIndexCreated"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMessageService } from '@/composables';
import prettyBytes from 'pretty-bytes';
import {
  useClusterManageStore,
  useDynamoManageStore,
  DatabaseType,
  DynamoDBConnection,
} from '../../../store';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';
import { DynamoIndex, DynamoIndexType, dynamoApi } from '../../../datasources';
import DeleteIndexModal from './delete-index-modal.vue';
import CreateIndexModal from './create-index-modal.vue';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const message = useMessageService();
const lang = useLang();

const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

const dynamoManageStore = useDynamoManageStore();
const { fetchTableInfo } = dynamoManageStore;
const { tableInfo } = storeToRefs(dynamoManageStore);

// Modal visibility states
const showDeleteIndexModal = ref(false);
const showCreateIndexModal = ref(false);
const selectedIndex = ref<DynamoIndex | null>(null);

// CloudWatch metrics state
const metricsAvailable = ref(false);
const metricsMessage = ref('');
const metricsLoading = ref(false);
const refreshLoading = ref(false);
const consumedReadData = ref<number[]>([]);
const consumedWriteData = ref<number[]>([]);

// Type-safe accessor for DynamoDB connection properties
const dynamoConnection = computed(() => {
  if (connection.value?.type === DatabaseType.DYNAMODB) {
    return connection.value as DynamoDBConnection;
  }
  return undefined;
});

const billingMode = computed(() => {
  const mode = tableInfo.value?.billingMode;
  if (!mode) return lang.t('manage.dynamo.provisioned');
  return mode === 'PAY_PER_REQUEST'
    ? lang.t('manage.dynamo.onDemand')
    : lang.t('manage.dynamo.provisioned');
});

// Metrics values - will be fetched from server
const pitrEnabled = ref(false);
const ttlEnabled = ref(false);
const ttlAttribute = ref<string>();
const rcuUtilization = ref(0);
const wcuUtilization = ref(0);
const provisionedRcu = ref(0);
const provisionedWcu = ref(0);
const throttledEvents = ref(0);

const streamsEnabled = computed(() => {
  return tableInfo.value?.streamSpecification?.streamEnabled || false;
});

const streamsViewType = computed(() => {
  return tableInfo.value?.streamSpecification?.streamViewType || '-';
});

const encryptionType = computed(() => {
  const sse = tableInfo.value?.sseDescription;
  if (!sse || sse.status !== 'ENABLED') return 'Not Enabled';
  if (sse.sseType === 'KMS') {
    return sse.kmsMasterKeyArn ? 'Customer Managed Key' : 'AWS Managed Key';
  }
  return 'AWS Owned Key';
});

const tableClass = computed(() => {
  const cls = tableInfo.value?.tableClassSummary;
  return cls === 'STANDARD_INFREQUENT_ACCESS' ? 'DynamoDB Standard-IA' : 'DynamoDB Standard';
});

// Generate SVG path points from data
const readChartPoints = computed(() => {
  if (!consumedReadData.value.length) {
    return '0,70 40,65 80,75 120,50 160,55 200,40 240,45 280,30 320,35 360,20 400,25';
  }
  const data = consumedReadData.value;
  const maxVal = Math.max(...data, 1);
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1 || 1)) * 400;
    const y = 90 - (val / maxVal) * 80;
    return `${x},${y}`;
  });
  return points.join(' ');
});

const writeChartPoints = computed(() => {
  if (!consumedWriteData.value.length) {
    return '0,85 40,80 80,82 120,78 160,80 200,75 240,70 280,72 320,65 360,60 400,55';
  }
  const data = consumedWriteData.value;
  const maxVal = Math.max(...data, 1);
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1 || 1)) * 400;
    const y = 90 - (val / maxVal) * 80;
    return `${x},${y}`;
  });
  return points.join(' ');
});

const statusClass = computed(() => {
  const status = tableInfo.value?.status?.toUpperCase();
  return {
    'status-active': status === 'ACTIVE',
    'status-creating': status === 'CREATING',
    'status-updating': status === 'UPDATING',
    'status-deleting': status === 'DELETING',
  };
});

const globalSecondaryIndexes = computed(() => {
  return (
    tableInfo.value?.indices?.filter((index: DynamoIndex) => index.type === DynamoIndexType.GSI) ||
    []
  );
});

// Helper functions for table rendering
const getPartitionKey = (row: DynamoIndex): string => {
  const pks = row.keySchema?.filter(k => k.keyType.toUpperCase() === 'HASH') || [];
  if (pks.length === 0) return '-';
  return pks
    .map(pk => {
      const attrDef = tableInfo.value?.attributeDefinitions?.find(
        a => a.attributeName === pk.attributeName,
      );
      return `${pk.attributeName} (${attrDef?.attributeType || 'S'})`;
    })
    .join(', ');
};

const getSortKey = (row: DynamoIndex): string => {
  const sks = row.keySchema?.filter(k => k.keyType.toUpperCase() === 'RANGE') || [];
  if (sks.length === 0) return '-';
  return sks
    .map(sk => {
      const attrDef = tableInfo.value?.attributeDefinitions?.find(
        a => a.attributeName === sk.attributeName,
      );
      return `${sk.attributeName} (${attrDef?.attributeType || 'S'})`;
    })
    .join(', ');
};

const getProjection = (row: DynamoIndex): string => {
  const projectionType = row.projection?.projectionType?.toUpperCase() || 'ALL';
  if (projectionType === 'INCLUDE') {
    const attrs = row.projection?.nonKeyAttributes || [];
    return attrs.length > 0 ? `INCLUDE [${attrs.join(', ')}]` : 'INCLUDE';
  }
  return projectionType;
};

const formatIndexSize = (row: DynamoIndex): string => {
  if (!row.sizeBytes) return '-';
  const sizeInKB = row.sizeBytes / 1024;
  const sizeInMB = sizeInKB / 1024;
  const sizeInGB = sizeInMB / 1024;
  if (sizeInGB >= 1) {
    return `${sizeInGB.toFixed(2)} GB`;
  } else if (sizeInMB >= 1) {
    return `${sizeInMB.toFixed(2)} MB`;
  } else if (sizeInKB >= 1) {
    return `${sizeInKB.toFixed(2)} KB`;
  } else {
    return `${row.sizeBytes} B`;
  }
};

const formatIndexItemCount = (row: DynamoIndex): string => {
  if (row.itemCount === undefined || row.itemCount === null) return '-';
  return row.itemCount.toLocaleString();
};

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString();
};

const formatBytes = (bytes: number | undefined) => {
  if (bytes === undefined || bytes === null) return '-';
  return prettyBytes(bytes);
};

const fetchCloudWatchMetrics = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) {
    return;
  }

  try {
    metricsLoading.value = true;
    const result = await dynamoApi.getTableMetrics(connection.value as DynamoDBConnection, 24);

    metricsAvailable.value = result.available;
    metricsMessage.value = result.message || '';

    if (result.available && result.metrics) {
      consumedReadData.value = result.metrics.consumedRead || [];
      consumedWriteData.value = result.metrics.consumedWrite || [];
      rcuUtilization.value = result.metrics.rcuUtilization || 0;
      wcuUtilization.value = result.metrics.wcuUtilization || 0;
      provisionedRcu.value = result.metrics.provisionedReadCapacity || 0;
      provisionedWcu.value = result.metrics.provisionedWriteCapacity || 0;
      throttledEvents.value = result.metrics.totalThrottledEvents || 0;
    }
  } catch (err) {
    metricsAvailable.value = false;
    const error = err as CustomError;
    metricsMessage.value = error.details || error.message || 'Failed to fetch CloudWatch metrics';
  } finally {
    metricsLoading.value = false;
  }
};

const handleRefresh = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) {
    message.warning(lang.t('editor.establishedRequired'));
    return;
  }

  refreshLoading.value = true;
  const timeoutId = setTimeout(() => {
    refreshLoading.value = false;
    message.warning(lang.t('manage.dynamo.refreshTimeout'));
  }, 30000);

  try {
    await fetchTableInfo(connection.value);

    // Fetch PITR status
    try {
      const pitrData = await dynamoApi.describeContinuousBackups(connection.value);
      pitrEnabled.value = pitrData.pitrEnabled || false;
    } catch (err) {
      console.warn('Failed to fetch PITR status:', err);
      pitrEnabled.value = false;
    }

    // Fetch TTL status
    try {
      const ttlData = await dynamoApi.describeTimeToLive(connection.value);
      ttlEnabled.value = ttlData.ttlEnabled;
      ttlAttribute.value = ttlData.attributeName;
    } catch (err) {
      console.warn('Failed to fetch TTL status:', err);
      ttlEnabled.value = false;
      ttlAttribute.value = undefined;
    }

    // Also fetch CloudWatch metrics
    await fetchCloudWatchMetrics();
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.status}: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  } finally {
    clearTimeout(timeoutId);
    refreshLoading.value = false;
  }
};

const handleCreateIndex = () => {
  showCreateIndexModal.value = true;
};

const handleDeleteIndex = (index: DynamoIndex) => {
  selectedIndex.value = index;
  showDeleteIndexModal.value = true;
};

const handleIndexDeleted = async () => {
  message.success(lang.t('manage.dynamo.deleteIndexSuccess'));
  await handleRefresh();
};

const handleIndexCreated = async () => {
  message.success(lang.t('manage.dynamo.createIndexSuccess'));
  await handleRefresh();
};

onMounted(async () => {
  if (connection.value && connection.value.type === DatabaseType.DYNAMODB) {
    await handleRefresh();
  }
});

watch(connection, async newConnection => {
  if (newConnection && newConnection.type === DatabaseType.DYNAMODB) {
    await handleRefresh();
  }
});

// Expose handleRefresh so parent can trigger it
defineExpose({
  handleRefresh,
});
</script>

<style scoped>
.dynamo-manage-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
  padding-right: 32px;
  background-color: hsl(var(--background));
  box-sizing: border-box;
  position: relative;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.dynamo-manage-container::-webkit-scrollbar {
  display: none;
}

.refresh-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: hsl(var(--background) / 0.8);
  z-index: 10;
}

.refresh-text {
  margin-top: 8px;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
}

.metrics-section {
  margin-bottom: 24px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
}

@media (max-width: 1200px) {
  .metrics-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.metric-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.metric-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.metric-value-small {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.status-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--muted-foreground));
}

.status-indicator.status-active {
  background-color: #36ad6a;
  animation: pulse 2s infinite;
}

.status-indicator.status-creating,
.status-indicator.status-updating {
  background-color: #f0a020;
}

.status-indicator.status-deleting {
  background-color: #d03050;
}

.status-text {
  font-size: 14px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.status-text.status-active {
  color: #166534;
  background-color: #dcfce7;
}

.status-text.status-creating,
.status-text.status-updating {
  color: #9a3412;
  background-color: #ffedd5;
}

.status-text.status-deleting {
  color: #991b1b;
  background-color: #fee2e2;
}

.metric-value-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-enabled {
  color: #36ad6a;
  font-weight: 500;
}

.status-disabled {
  color: #d03050;
  font-weight: 500;
}

.ttl-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ttl-value .status-enabled {
  font-size: 14px;
}

.ttl-value .status-disabled {
  font-size: 14px;
}

.ttl-attribute {
  font-family: monospace;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.performance-section {
  margin-bottom: 24px;
}

.performance-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.time-range {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #36ad6a;
}

.performance-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
}

@media (max-width: 900px) {
  .performance-content {
    grid-template-columns: 1fr;
  }
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.chart-legend {
  display: flex;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.read {
  background-color: #3b82f6;
}

.legend-color.write {
  background-color: #fb923c;
}

.chart-placeholder {
  height: 200px;
  border-left: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
  padding: 8px;
}

.chart-svg {
  width: 100%;
  height: 100%;
}

.utilization-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
}

.utilization-item {
  display: flex;
  align-items: center;
  gap: 16px;
}

.utilization-gauge {
  position: relative;
  width: 64px;
  height: 64px;
}

.gauge-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.gauge-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.utilization-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.utilization-label {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.utilization-detail {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.throttled-events {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: hsl(var(--background));
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
}

.throttled-label {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.throttled-value {
  font-size: 12px;
  font-weight: 700;
  color: #36ad6a;
  background: #dcfce7;
  padding: 2px 8px;
  border-radius: 4px;
}

.indexes-section {
  margin-bottom: 24px;
}

.indexes-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.table-container {
  overflow-x: auto;
}

.action-buttons {
  display: flex;
  gap: 4px;
}

.settings-section {
  margin-bottom: 24px;
}

.settings-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

@media (max-width: 768px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

.setting-item {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 12px 16px;
  transition: all 0.2s ease;
}

.setting-item.clickable {
  cursor: pointer;
}

.setting-item.clickable:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.setting-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.setting-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.setting-value {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
