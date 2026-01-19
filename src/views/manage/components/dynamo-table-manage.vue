<template>
  <div class="dynamo-manage-container">
    <!-- Header Section -->
    <div class="header-section">
      <div class="header-content">
        <div class="header-left">
          <span class="breadcrumb">{{ $t('aside.manage') }} / DynamoDB</span>
          <h1 class="table-name">{{ tableInfo?.name || dynamoConnection?.tableName || '-' }}</h1>
        </div>
        <div class="header-right">
          <span class="last-updated">{{ $t('manage.dynamo.lastUpdated') }}: {{ lastUpdated }}</span>
          <n-button quaternary size="small" @click="handleRefresh" :loading="loading">
            <template #icon>
              <n-icon><Renew /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </div>

    <!-- Metrics Cards Section -->
    <section class="metrics-section">
      <div class="metrics-grid">
        <!-- Status Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.status') }}</span>
          <div class="metric-value status-value">
            <span class="status-indicator" :class="statusClass"></span>
            <n-tag :type="statusTagType" size="small">
              {{ tableInfo?.status || '-' }}
            </n-tag>
          </div>
        </n-card>

        <!-- Item Count Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.itemCount') }}</span>
          <span class="metric-value">{{ formatNumber(tableInfo?.itemCount) }}</span>
        </n-card>

        <!-- Table Size Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.tableSize') }}</span>
          <span class="metric-value">{{ formatBytes(tableInfo?.sizeBytes) }}</span>
        </n-card>

        <!-- Billing Mode Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.billingMode') }}</span>
          <span class="metric-value-small">{{ billingMode }}</span>
        </n-card>

        <!-- Partition Key Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.partitionKey') }}</span>
          <span class="metric-value-code">
            {{ tableInfo?.partitionKey?.name || '-' }}
            <span v-if="tableInfo?.partitionKey?.valueType" class="key-type">
              ({{ tableInfo.partitionKey.valueType }})
            </span>
          </span>
        </n-card>

        <!-- Sort Key Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.sortKey') }}</span>
          <span class="metric-value-code">
            <template v-if="tableInfo?.sortKey?.name">
              {{ tableInfo.sortKey.name }}
              <span class="key-type">({{ tableInfo.sortKey.valueType }})</span>
            </template>
            <template v-else>-</template>
          </span>
        </n-card>
      </div>
    </section>

    <!-- Table Info Section -->
    <section class="info-section">
      <n-card class="info-card">
        <template #header>
          <div class="section-header">
            <n-icon size="18"><Information /></n-icon>
            <span>{{ $t('manage.dynamo.tableInfo') }}</span>
          </div>
        </template>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">{{ $t('manage.dynamo.tableId') }}</span>
            <span class="info-value">{{ tableInfo?.id || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ $t('manage.dynamo.creationDate') }}</span>
            <span class="info-value">{{ formatDate(tableInfo?.creationDateTime) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ $t('manage.dynamo.region') }}</span>
            <span class="info-value">{{ dynamoConnection?.region || '-' }}</span>
          </div>
        </div>
      </n-card>
    </section>

    <!-- Global Secondary Indexes Section -->
    <section class="indexes-section">
      <n-card class="indexes-card">
        <template #header>
          <div class="section-header">
            <n-icon size="18"><TableSplit /></n-icon>
            <span>{{ $t('manage.dynamo.gsiTitle') }}</span>
            <n-tag size="small" type="info" class="index-count">
              {{ gsiCount }}
            </n-tag>
          </div>
        </template>
        <div v-if="globalSecondaryIndexes.length > 0" class="table-container">
          <n-data-table
            :columns="gsiColumns"
            :data="globalSecondaryIndexes"
            :bordered="false"
            size="small"
          />
        </div>
        <n-empty v-else :description="$t('manage.dynamo.noGsi')" />
      </n-card>
    </section>

    <!-- Local Secondary Indexes Section -->
    <section v-if="localSecondaryIndexes.length > 0" class="indexes-section">
      <n-card class="indexes-card">
        <template #header>
          <div class="section-header">
            <n-icon size="18"><TableSplit /></n-icon>
            <span>{{ $t('manage.dynamo.lsiTitle') }}</span>
            <n-tag size="small" type="info" class="index-count">
              {{ localSecondaryIndexes.length }}
            </n-tag>
          </div>
        </template>
        <div class="table-container">
          <n-data-table
            :columns="lsiColumns"
            :data="localSecondaryIndexes"
            :bordered="false"
            size="small"
          />
        </div>
      </n-card>
    </section>

    <!-- Attribute Definitions Section -->
    <section class="attributes-section">
      <n-card class="attributes-card">
        <template #header>
          <div class="section-header">
            <n-icon size="18"><DataTable /></n-icon>
            <span>{{ $t('manage.dynamo.attributeDefinitions') }}</span>
          </div>
        </template>
        <div v-if="tableInfo?.attributeDefinitions?.length" class="table-container">
          <n-data-table
            :columns="attributeColumns"
            :data="tableInfo.attributeDefinitions"
            :bordered="false"
            size="small"
          />
        </div>
        <n-empty v-else :description="$t('manage.dynamo.noAttributes')" />
      </n-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { NTag } from 'naive-ui';
import { Renew, Information, TableSplit, DataTable } from '@vicons/carbon';
import prettyBytes from 'pretty-bytes';
import {
  useClusterManageStore,
  useDynamoManageStore,
  DatabaseType,
  DynamoDBConnection,
} from '../../../store';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';
import { DynamoIndex, DynamoIndexType } from '../../../datasources';

const message = useMessage();
const lang = useLang();

const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

const dynamoManageStore = useDynamoManageStore();
const { fetchTableInfo } = dynamoManageStore;
const { tableInfo, loading, lastUpdatedTime } = storeToRefs(dynamoManageStore);

// Type-safe accessor for DynamoDB connection properties
const dynamoConnection = computed(() => {
  if (connection.value?.type === DatabaseType.DYNAMODB) {
    return connection.value as DynamoDBConnection;
  }
  return undefined;
});

const lastUpdated = computed(() => {
  if (!lastUpdatedTime.value) return lang.t('manage.dynamo.never');
  return new Date(lastUpdatedTime.value).toLocaleTimeString();
});

const billingMode = computed(() => {
  // Default to On-Demand as we don't have this info from the API yet
  return lang.t('manage.dynamo.onDemand');
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

const statusTagType = computed(() => {
  const status = tableInfo.value?.status?.toUpperCase();
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'CREATING':
    case 'UPDATING':
      return 'warning';
    case 'DELETING':
      return 'error';
    default:
      return 'default';
  }
});

const globalSecondaryIndexes = computed(() => {
  return (
    tableInfo.value?.indices?.filter(
      (index: DynamoIndex) => index.type === DynamoIndexType.GSI,
    ) || []
  );
});

const localSecondaryIndexes = computed(() => {
  return (
    tableInfo.value?.indices?.filter(
      (index: DynamoIndex) => index.type === DynamoIndexType.LSI,
    ) || []
  );
});

const gsiCount = computed(() => globalSecondaryIndexes.value.length);

const gsiColumns = computed(() => [
  {
    title: lang.t('manage.dynamo.indexName'),
    key: 'name',
  },
  {
    title: lang.t('manage.dynamo.partitionKey'),
    key: 'partitionKey',
    render: (row: DynamoIndex) => {
      const pk = row.keySchema?.find(k => k.keyType.toUpperCase() === 'HASH');
      return pk ? `${pk.attributeName}` : '-';
    },
  },
  {
    title: lang.t('manage.dynamo.sortKey'),
    key: 'sortKey',
    render: (row: DynamoIndex) => {
      const sk = row.keySchema?.find(k => k.keyType.toUpperCase() === 'RANGE');
      return sk ? `${sk.attributeName}` : '-';
    },
  },
  {
    title: lang.t('manage.dynamo.indexStatus'),
    key: 'status',
    render: (row: DynamoIndex) => {
      const status = row.status?.toUpperCase() || 'UNKNOWN';
      const type = status === 'ACTIVE' ? 'success' : status === 'CREATING' ? 'warning' : 'default';
      return h(NTag, { type, size: 'small' }, { default: () => status });
    },
  },
  {
    title: lang.t('manage.dynamo.rcu'),
    key: 'rcu',
    render: (row: DynamoIndex) => row.provisionedThroughput?.readCapacityUnits ?? '-',
  },
  {
    title: lang.t('manage.dynamo.wcu'),
    key: 'wcu',
    render: (row: DynamoIndex) => row.provisionedThroughput?.writeCapacityUnits ?? '-',
  },
]);

const lsiColumns = computed(() => [
  {
    title: lang.t('manage.dynamo.indexName'),
    key: 'name',
  },
  {
    title: lang.t('manage.dynamo.partitionKey'),
    key: 'partitionKey',
    render: (row: DynamoIndex) => {
      const pk = row.keySchema?.find(k => k.keyType.toUpperCase() === 'HASH');
      return pk ? `${pk.attributeName}` : '-';
    },
  },
  {
    title: lang.t('manage.dynamo.sortKey'),
    key: 'sortKey',
    render: (row: DynamoIndex) => {
      const sk = row.keySchema?.find(k => k.keyType.toUpperCase() === 'RANGE');
      return sk ? `${sk.attributeName}` : '-';
    },
  },
]);

const attributeColumns = [
  {
    title: lang.t('manage.dynamo.attributeName'),
    key: 'attributeName',
  },
  {
    title: lang.t('manage.dynamo.attributeType'),
    key: 'attributeType',
  },
];

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString();
};

const formatBytes = (bytes: number | undefined) => {
  if (bytes === undefined || bytes === null) return '-';
  return prettyBytes(bytes);
};

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

const handleRefresh = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.DYNAMODB) {
    message.warning(lang.t('editor.establishedRequired'));
    return;
  }
  try {
    await fetchTableInfo(connection.value);
  } catch (err) {
    const error = err as CustomError;
    message.error(`${error.status}: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 5000,
    });
  }
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
</script>

<style lang="scss" scoped>
.dynamo-manage-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  background-color: var(--n-color);

  .header-section {
    margin-bottom: 16px;

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;

      .header-left {
        .breadcrumb {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--n-text-color-3);
        }

        .table-name {
          font-size: 20px;
          font-weight: 700;
          margin: 4px 0 0 0;
          color: var(--n-text-color-1);
        }
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 8px;

        .last-updated {
          font-size: 12px;
          color: var(--n-text-color-3);
        }
      }
    }
  }

  .metrics-section {
    margin-bottom: 16px;

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;

      .metric-card {
        :deep(.n-card__content) {
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--n-text-color-3);
        }

        .metric-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--n-text-color-1);
        }

        .metric-value-small {
          font-size: 14px;
          font-weight: 600;
          color: var(--n-text-color-1);
        }

        .metric-value-code {
          font-size: 13px;
          font-weight: 500;
          font-family: monospace;
          color: var(--n-text-color-1);

          .key-type {
            color: var(--n-text-color-3);
            font-size: 11px;
          }
        }

        .status-value {
          display: flex;
          align-items: center;
          gap: 8px;

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--n-text-color-3);

            &.status-active {
              background-color: #36ad6a;
              box-shadow: 0 0 8px rgba(54, 173, 106, 0.5);
            }

            &.status-creating,
            &.status-updating {
              background-color: #f0a020;
            }

            &.status-deleting {
              background-color: #d03050;
            }
          }
        }
      }
    }
  }

  .info-section,
  .indexes-section,
  .attributes-section {
    margin-bottom: 16px;

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;

      .index-count {
        margin-left: auto;
      }
    }
  }

  .info-card {
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;

      .info-item {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .info-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--n-text-color-3);
        }

        .info-value {
          font-size: 13px;
          color: var(--n-text-color-1);
          word-break: break-all;
        }
      }
    }
  }

  .table-container {
    :deep(.n-data-table) {
      .n-data-table-th {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .n-data-table-td {
        font-size: 13px;
      }
    }
  }
}
</style>
