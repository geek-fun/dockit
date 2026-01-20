<template>
  <div class="dynamo-manage-container">
    <!-- Header Section -->
    <div class="header-section">
      <div class="header-content">
        <div class="header-left">
          <span class="breadcrumb">{{ $t('manage.dynamo.breadcrumb') }}</span>
          <h1 class="table-name">{{ tableInfo?.name || dynamoConnection?.tableName || '-' }}</h1>
        </div>
        <div class="header-right">
          <span class="last-updated">{{ $t('manage.dynamo.lastUpdated') }}: {{ lastUpdated }}</span>
          <n-button quaternary size="small" @click="handleRefresh" :loading="loading">
            <template #icon>
              <n-icon><Renew /></n-icon>
            </template>
          </n-button>
          <n-button type="primary" @click="handleSettings">
            <template #icon>
              <n-icon><Settings /></n-icon>
            </template>
            {{ $t('manage.dynamo.settings') }}
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
            <span class="status-text" :class="statusClass">{{ tableInfo?.status || '-' }}</span>
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

        <!-- Mode Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.mode') }}</span>
          <span class="metric-value-small">{{ billingMode }}</span>
        </n-card>

        <!-- PITR Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.pitr') }}</span>
          <div class="metric-value-status">
            <n-icon :color="pitrEnabled ? '#36ad6a' : '#d03050'">
              <CheckmarkFilled v-if="pitrEnabled" />
              <CloseFilled v-else />
            </n-icon>
            <span :class="pitrEnabled ? 'status-enabled' : 'status-disabled'">
              {{ pitrEnabled ? $t('manage.dynamo.enabled') : $t('manage.dynamo.disabled') }}
            </span>
          </div>
        </n-card>

        <!-- TTL Card -->
        <n-card class="metric-card">
          <span class="metric-label">{{ $t('manage.dynamo.ttl') }}</span>
          <div class="ttl-value">
            <span :class="ttlEnabled ? 'status-enabled' : 'status-disabled'">
              {{ ttlEnabled ? $t('manage.dynamo.enabled') : $t('manage.dynamo.disabled') }}
            </span>
            <span v-if="ttlEnabled && ttlAttribute" class="ttl-attribute">{{ ttlAttribute }}</span>
          </div>
        </n-card>
      </div>
    </section>

    <!-- Performance & Capacity Section -->
    <section class="performance-section">
      <n-card class="performance-card">
        <template #header>
          <div class="section-header">
            <div class="section-title">
              <n-icon size="18"><ChartLineData /></n-icon>
              <span>{{ $t('manage.dynamo.performanceCapacity') }}</span>
            </div>
            <span class="time-range">{{ $t('manage.dynamo.last24Hours') }}</span>
          </div>
        </template>
        <div class="performance-content">
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
                <path d="M0 20 H400 M0 40 H400 M0 60 H400 M0 80 H400" stroke="#f1f5f9" stroke-width="1" />
                <polyline 
                  fill="none" 
                  points="0,70 40,65 80,75 120,50 160,55 200,40 240,45 280,30 320,35 360,20 400,25" 
                  stroke="#3b82f6" 
                  stroke-width="2" 
                  vector-effect="non-scaling-stroke"
                />
                <polyline 
                  fill="none" 
                  points="0,85 40,80 80,82 120,78 160,80 200,75 240,70 280,72 320,65 360,60 400,55" 
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
      </n-card>
    </section>

    <!-- Global Secondary Indexes Section -->
    <section class="indexes-section">
      <n-card class="indexes-card">
        <template #header>
          <div class="section-header">
            <div class="section-title">
              <n-icon size="18"><TableSplit /></n-icon>
              <span>{{ $t('manage.dynamo.gsiTitle') }}</span>
            </div>
            <n-button type="primary" size="small" @click="handleCreateIndex">
              {{ $t('manage.dynamo.createIndex') }}
            </n-button>
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

    <!-- Table Settings Section -->
    <section class="settings-section">
      <n-card class="settings-card">
        <template #header>
          <div class="section-header">
            <div class="section-title">
              <n-icon size="18"><SettingsAdjust /></n-icon>
              <span>{{ $t('manage.dynamo.tableSettings') }}</span>
            </div>
          </div>
        </template>
        <div class="settings-grid">
          <!-- Streams Setting -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-label">{{ $t('manage.dynamo.streams') }}</span>
              <n-switch :value="streamsEnabled" size="small" disabled />
            </div>
            <span class="setting-value">{{ streamsViewType || '-' }}</span>
          </div>
          <!-- Encryption Setting -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-label">{{ $t('manage.dynamo.encryption') }}</span>
              <n-icon size="16"><Locked /></n-icon>
            </div>
            <span class="setting-value">{{ encryptionType }}</span>
          </div>
          <!-- Table Class Setting -->
          <div class="setting-item">
            <div class="setting-header">
              <span class="setting-label">{{ $t('manage.dynamo.tableClass') }}</span>
              <n-icon size="16"><DataTable /></n-icon>
            </div>
            <span class="setting-value">{{ tableClass }}</span>
          </div>
        </div>
      </n-card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { NTag, NButton, NIcon } from 'naive-ui';
import {
  Renew,
  Settings,
  ChartLineData,
  TableSplit,
  SettingsAdjust,
  Locked,
  DataTable,
  CheckmarkFilled,
  CloseFilled,
  Edit,
  TrashCan,
} from '@vicons/carbon';
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
  if (!lastUpdatedTime.value) return lang.t('manage.dynamo.justNow');
  const diff = Date.now() - lastUpdatedTime.value;
  if (diff < 60000) return lang.t('manage.dynamo.justNow');
  return new Date(lastUpdatedTime.value).toLocaleTimeString();
});

const billingMode = computed(() => {
  return lang.t('manage.dynamo.provisioned');
});

// Mock values for demonstration - these would come from extended API
const pitrEnabled = ref(true);
const ttlEnabled = ref(true);
const ttlAttribute = ref('expiry_date');
const rcuUtilization = ref(45);
const wcuUtilization = ref(25);
const provisionedRcu = ref(100);
const provisionedWcu = ref(50);
const throttledEvents = ref(0);
const streamsEnabled = ref(true);
const streamsViewType = ref('NEW_AND_OLD_IMAGES');
const encryptionType = ref('AWS Managed Key');
const tableClass = ref('DynamoDB Standard');

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
    tableInfo.value?.indices?.filter(
      (index: DynamoIndex) => index.type === DynamoIndexType.GSI,
    ) || []
  );
});

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
      if (!pk) return '-';
      const attrDef = tableInfo.value?.attributeDefinitions?.find(
        a => a.attributeName === pk.attributeName,
      );
      return `${pk.attributeName} (${attrDef?.attributeType || 'S'})`;
    },
  },
  {
    title: lang.t('manage.dynamo.sortKey'),
    key: 'sortKey',
    render: (row: DynamoIndex) => {
      const sk = row.keySchema?.find(k => k.keyType.toUpperCase() === 'RANGE');
      if (!sk) return '-';
      const attrDef = tableInfo.value?.attributeDefinitions?.find(
        a => a.attributeName === sk.attributeName,
      );
      return `${sk.attributeName} (${attrDef?.attributeType || 'S'})`;
    },
  },
  {
    title: lang.t('manage.dynamo.projection'),
    key: 'projection',
    render: () => 'ALL',
  },
  {
    title: lang.t('manage.dynamo.indexStatus'),
    key: 'status',
    render: (row: DynamoIndex) => {
      const status = row.status?.toUpperCase() || 'ACTIVE';
      return h(
        NTag,
        {
          type: status === 'ACTIVE' ? 'success' : 'warning',
          size: 'small',
        },
        { default: () => status },
      );
    },
  },
  {
    title: lang.t('manage.dynamo.actions'),
    key: 'actions',
    width: 100,
    render: (row: DynamoIndex) => {
      return h('div', { class: 'action-buttons' }, [
        h(
          NButton,
          {
            quaternary: true,
            size: 'small',
            onClick: () => handleEditIndex(row),
          },
          { icon: () => h(NIcon, null, { default: () => h(Edit) }) },
        ),
        h(
          NButton,
          {
            quaternary: true,
            size: 'small',
            onClick: () => handleDeleteIndex(row),
          },
          { icon: () => h(NIcon, { color: '#d03050' }, { default: () => h(TrashCan) }) },
        ),
      ]);
    },
  },
]);

const formatNumber = (num: number | undefined) => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString();
};

const formatBytes = (bytes: number | undefined) => {
  if (bytes === undefined || bytes === null) return '-';
  return prettyBytes(bytes);
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

const handleSettings = () => {
  message.info(lang.t('manage.dynamo.settingsComingSoon'));
};

const handleCreateIndex = () => {
  message.info(lang.t('manage.dynamo.createIndexComingSoon'));
};

const handleEditIndex = (index: DynamoIndex) => {
  message.info(`Edit index: ${index.name}`);
};

const handleDeleteIndex = (index: DynamoIndex) => {
  message.info(`Delete index: ${index.name}`);
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
  padding: 24px;
  padding-right: 32px;
  background-color: #f8fafc;

  .header-section {
    margin-bottom: 24px;

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;

      .header-left {
        .breadcrumb {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94a3b8;
        }

        .table-name {
          font-size: 24px;
          font-weight: 700;
          margin: 4px 0 0 0;
          color: #0f172a;
        }
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 16px;

        .last-updated {
          font-size: 12px;
          color: #94a3b8;
        }
      }
    }
  }

  .metrics-section {
    margin-bottom: 24px;

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;

      @media (max-width: 1200px) {
        grid-template-columns: repeat(3, 1fr);
      }

      @media (max-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
      }

      .metric-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;

        :deep(.n-card__content) {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .metric-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #94a3b8;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
        }

        .metric-value-small {
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
        }

        .status-value {
          display: flex;
          align-items: center;
          gap: 8px;

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #94a3b8;

            &.status-active {
              background-color: #36ad6a;
              animation: pulse 2s infinite;
            }

            &.status-creating,
            &.status-updating {
              background-color: #f0a020;
            }

            &.status-deleting {
              background-color: #d03050;
            }
          }

          .status-text {
            font-size: 14px;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 4px;

            &.status-active {
              color: #166534;
              background-color: #dcfce7;
            }

            &.status-creating,
            &.status-updating {
              color: #9a3412;
              background-color: #ffedd5;
            }

            &.status-deleting {
              color: #991b1b;
              background-color: #fee2e2;
            }
          }
        }

        .metric-value-status {
          display: flex;
          align-items: center;
          gap: 6px;

          .status-enabled {
            color: #36ad6a;
            font-weight: 500;
          }

          .status-disabled {
            color: #d03050;
            font-weight: 500;
          }
        }

        .ttl-value {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .status-enabled {
            color: #36ad6a;
            font-weight: 500;
            font-size: 14px;
          }

          .status-disabled {
            color: #d03050;
            font-weight: 500;
            font-size: 14px;
          }

          .ttl-attribute {
            font-family: monospace;
            font-size: 10px;
            color: #94a3b8;
          }
        }
      }
    }
  }

  .performance-section {
    margin-bottom: 24px;

    .performance-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #0f172a;
        }

        .time-range {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #36ad6a;
        }
      }

      .performance-content {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 32px;

        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }

        .chart-section {
          .chart-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;

            .chart-title {
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              color: #64748b;
            }

            .chart-legend {
              display: flex;
              gap: 16px;

              .legend-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #64748b;

                .legend-color {
                  width: 12px;
                  height: 12px;
                  border-radius: 2px;

                  &.read {
                    background-color: #3b82f6;
                  }

                  &.write {
                    background-color: #fb923c;
                  }
                }
              }
            }
          }

          .chart-placeholder {
            height: 200px;
            border-left: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
            padding: 8px;

            .chart-svg {
              width: 100%;
              height: 100%;
            }
          }
        }

        .utilization-section {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 24px;

          .utilization-item {
            display: flex;
            align-items: center;
            gap: 16px;

            .utilization-gauge {
              position: relative;
              width: 64px;
              height: 64px;

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
                color: #0f172a;
              }
            }

            .utilization-info {
              display: flex;
              flex-direction: column;
              gap: 2px;

              .utilization-label {
                font-size: 12px;
                font-weight: 600;
                color: #0f172a;
              }

              .utilization-detail {
                font-size: 10px;
                color: #94a3b8;
              }
            }
          }

          .throttled-events {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;

            .throttled-label {
              font-size: 12px;
              font-weight: 500;
              color: #64748b;
            }

            .throttled-value {
              font-size: 12px;
              font-weight: 700;
              color: #36ad6a;
              background: #dcfce7;
              padding: 2px 8px;
              border-radius: 4px;
            }
          }
        }
      }
    }
  }

  .indexes-section {
    margin-bottom: 24px;

    .indexes-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;

      .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #0f172a;
        }
      }

      .table-container {
        :deep(.n-data-table) {
          .n-data-table-th {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            color: #64748b;
            background: #f8fafc;
          }

          .n-data-table-td {
            font-size: 13px;
          }
        }

        .action-buttons {
          display: flex;
          gap: 4px;
        }
      }
    }
  }

  .settings-section {
    margin-bottom: 24px;

    .settings-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 12px;

      .section-header {
        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #0f172a;
        }
      }

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;

        @media (max-width: 768px) {
          grid-template-columns: 1fr;
        }

        .setting-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 12px 16px;

          .setting-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;

            .setting-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              color: #64748b;
            }
          }

          .setting-value {
            font-size: 12px;
            font-weight: 500;
            color: #64748b;
          }
        }
      }
    }
  }
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
