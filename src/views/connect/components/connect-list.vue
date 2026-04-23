<template>
  <div class="connection-list-container">
    <div v-if="connections.length > 0" class="connection-toolbar">
      <div class="toolbar-left">
        <span class="connections-title">{{ $t('connection.savedConnections') }}</span>
        <span class="connections-count">{{ filteredConnections.length }}</span>
      </div>
      <div class="toolbar-right">
        <div class="filter-input-wrapper">
          <span class="i-carbon-search filter-icon" />
          <Input
            v-model="filterText"
            :placeholder="$t('connection.filterPlaceholder')"
            class="filter-input"
          />
          <button v-if="filterText" class="filter-clear-btn" @click="filterText = ''">
            <span class="i-carbon-close h-3.5 w-3.5" />
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="sort-trigger">
              <span :class="sortDirIcon" class="h-4 w-4" />
              {{ $t(`connection.sortBy.${activeSortKey}`) }}
              <span class="i-carbon-chevron-down h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="sort-dropdown-content">
            <div class="sort-section-label">{{ $t('connection.sortBy.sortBy') }}</div>
            <DropdownMenuItem
              v-for="option in sortOptions"
              :key="option.key"
              class="sort-menu-item"
              @click="handleSortSelect(option.key)"
            >
              <span class="sort-item-label">{{ option.label }}</span>
              <span
                v-if="activeSortKey === option.key"
                :class="sortDirIcon"
                class="h-3.5 w-3.5 ml-auto text-primary"
              />
            </DropdownMenuItem>
            <div class="sort-divider" />
            <div class="sort-section-label">{{ $t('connection.sortBy.direction') }}</div>
            <DropdownMenuItem class="sort-menu-item" @click="toggleSortDir">
              <span class="sort-item-label">
                {{ $t(`connection.sortBy.${sortDir === 'asc' ? 'ascending' : 'descending'}`) }}
              </span>
              <span :class="sortDirIcon" class="h-3.5 w-3.5 ml-auto text-primary" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div class="connection-scroll-container">
      <div v-if="filteredConnections.length > 0" class="connection-list-body">
        <div
          v-for="connection in filteredConnections"
          :key="connection.id"
          class="connection-card"
          @dblclick="handleSelect('connect', connection)"
        >
          <!-- Top section: icon -->
          <div class="card-top">
            <div class="card-icon-wrapper">
              <component :is="getDatabaseIcon(connection.type)" class="h-6 w-6" />
            </div>
          </div>
          <!-- Name + connection string -->
          <div class="card-info">
            <div class="card-name">{{ connection.name }}</div>
            <div class="card-detail">{{ getConnectionDetail(connection) }}</div>
          </div>
          <!-- Badges -->
          <div class="card-badges">
            <Badge variant="outline" class="card-badge type-badge">
              {{ getDatabaseLabel(connection.type) }}
            </Badge>
            <Badge v-if="getVersion(connection)" variant="secondary" class="card-badge">
              {{ getVersion(connection) }}
            </Badge>
            <Badge
              v-if="connection.type === DatabaseType.DYNAMODB"
              variant="secondary"
              class="card-badge"
            >
              {{ getConnectionTarget(connection) }}
            </Badge>
            <TooltipProvider v-if="getEsProtocol(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    :class="[getEsProtocol(connection)!.icon, getEsProtocol(connection)!.color]"
                    class="h-3.5 w-3.5 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  {{ getEsProtocol(connection)!.label }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider v-if="getEsAuthType(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    :class="[getEsAuthType(connection)!.icon, getEsAuthType(connection)!.color]"
                    class="h-3.5 w-3.5 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  {{ getEsAuthType(connection)!.label }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <!-- Actions row -->
          <div class="card-actions" @click.stop="">
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="handleSelect('connect', connection)"
                  >
                    <span class="i-carbon-login h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {{ $t('connection.operations.connect') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" class="h-7 w-7">
                  <span class="i-carbon-overflow-menu-horizontal h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="handleSelect('edit', connection)">
                  <span class="i-carbon-edit h-4 w-4 mr-2" />
                  {{ $t('connection.operations.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleSelect('clone', connection)">
                  <span class="i-carbon-copy h-4 w-4 mr-2" />
                  {{ $t('connection.operations.clone') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive"
                  @click="handleSelect('remove', connection)"
                >
                  <span class="i-carbon-trash-can h-4 w-4 mr-2" />
                  {{ $t('connection.operations.remove') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div v-if="filterText && filteredConnections.length === 0" class="filter-empty-state">
        <span class="i-carbon-search h-8 w-8 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{{ $t('connection.noMatchingConnections') }}</p>
      </div>
    </div>
  </div>

  <Dialog v-model:open="showTypeSelect">
    <DialogContent class="database-type-dialog">
      <DialogHeader>
        <DialogTitle>{{ $t('connection.selectDatabase') }}</DialogTitle>
      </DialogHeader>
      <div class="database-type-buttons">
        <Button
          v-for="type in databaseTypes"
          :key="type.value"
          variant="outline"
          class="database-type-btn"
          @click="selectDatabaseType(type.value)"
        >
          <component :is="type.icon" class="database-type-icon" />
          {{ type.label }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>

  <FloatingMenu @add="showDatabaseTypeSelect" />
  <EsConnectDialog ref="esConnectDialog" />
  <DynamodbConnectDialog ref="dynamodbConnectDialog" />
  <ConnectingModal ref="connectingModal" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { cloneDeep } from 'lodash';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDialogService, useMessageService } from '@/composables';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import {
  Connection,
  DatabaseType,
  DynamoDBConnection,
  ElasticsearchConnection,
  useConnectionStore,
} from '../../../store';
import FloatingMenu from './floating-menu.vue';
import EsConnectDialog from './es-connect-dialog.vue';
import DynamodbConnectDialog from './dynamodb-connect-dialog.vue';
import ConnectingModal from './connecting-modal.vue';

type SortKey = 'name' | 'type' | 'dateCreated';

const emits = defineEmits(['tab-panel']);

const dialog = useDialogService();
const message = useMessageService();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, freshConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);
fetchConnections();

const filterText = ref('');
const activeSortKey = ref<SortKey>('name');
const sortDir = ref<'asc' | 'desc'>('asc');

const sortDirIcon = computed(() =>
  sortDir.value === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down',
);

const sortFns: Record<SortKey, (a: Connection, b: Connection) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  type: (a, b) =>
    a.type.localeCompare(b.type) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  dateCreated: (a, b) => (a.id ?? 0) - (b.id ?? 0),
};

const sortOptions = computed(() => [
  { key: 'name' as SortKey, label: lang.t('connection.sortBy.name') },
  { key: 'type' as SortKey, label: lang.t('connection.sortBy.type') },
  { key: 'dateCreated' as SortKey, label: lang.t('connection.sortBy.dateCreated') },
]);

const handleSortSelect = (key: SortKey) => {
  if (activeSortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    activeSortKey.value = key;
    sortDir.value = 'asc';
  }
};

const toggleSortDir = () => {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
};

const filteredConnections = computed(() => {
  const keyword = filterText.value.toLowerCase().trim();
  const dir = sortDir.value === 'asc' ? 1 : -1;

  const filtered = keyword
    ? connections.value.filter(c => c.name.toLowerCase().includes(keyword))
    : connections.value;

  return [...filtered].sort((a, b) => sortFns[activeSortKey.value](a, b) * dir);
});

const connectionCancelled = ref(false);
const connectingModal = ref();

const getDatabaseIcon = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? elasticsearch : dynamoDB;
};

const getDatabaseLabel = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? 'Elasticsearch' : 'DynamoDB';
};

const getConnectionDetail = (connection: Connection) => {
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    const es = connection as ElasticsearchConnection;
    const url = `${es.host}:${es.port}`;
    return url.length > 30 ? url.substring(0, 30) + '...' : url;
  }
  const dynamo = connection as DynamoDBConnection;
  return dynamo.region ? `${dynamo.region} / ${dynamo.tableName}` : dynamo.tableName;
};

const getVersion = (connection: Connection) => {
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    const es = connection as ElasticsearchConnection;
    return es.version ? `v${es.version}` : '';
  }
  return '';
};

const getConnectionTarget = (connection: Connection) => {
  const dynamo = connection as DynamoDBConnection;
  return dynamo.endpointUrl ? lang.t('connection.localTarget') : lang.t('connection.cloudTarget');
};

const getEsProtocol = (
  connection: Connection,
): { label: string; icon: string; color: string } | null => {
  if (connection.type !== DatabaseType.ELASTICSEARCH) return null;
  const es = connection as ElasticsearchConnection;
  const isHttps = es.host?.toLowerCase().startsWith('https://');
  return isHttps
    ? { label: 'HTTPS', icon: 'i-carbon-locked', color: 'text-green-500' }
    : { label: 'HTTP', icon: 'i-carbon-unlocked', color: 'text-yellow-500' };
};

const getEsAuthType = (
  connection: Connection,
): { label: string; icon: string; color: string } | null => {
  if (connection.type !== DatabaseType.ELASTICSEARCH) return null;
  const es = connection as ElasticsearchConnection;
  if (es.authType === 'basic')
    return {
      label: lang.t('connection.authTypeBasic'),
      icon: 'i-carbon-password',
      color: 'text-blue-500',
    };
  if (es.authType === 'apiKey')
    return {
      label: lang.t('connection.authTypeApiKey'),
      icon: 'i-carbon-api',
      color: 'text-blue-500',
    };
  return {
    label: lang.t('connection.authTypeNone'),
    icon: 'i-carbon-subtract',
    color: 'text-muted-foreground',
  };
};

const handleSelect = (key: string, connection: Connection) => {
  switch (key) {
    case 'connect':
      establishConnect(connection);
      break;
    case 'edit':
      editConnect(connection);
      break;
    case 'clone':
      cloneConnect(connection);
      break;
    case 'remove':
      removeConnect(connection);
      break;
  }
};

const establishConnect = async (connection: Connection) => {
  connectionCancelled.value = false;

  // Show loading modal with retry callback
  connectingModal.value.show(
    connection.name,
    () => {
      connectionCancelled.value = true;
    },
    () => establishConnect(connection),
  );

  const startTime = Date.now();

  try {
    const newConnection = await freshConnection(connection);

    if (connectionCancelled.value) {
      return;
    }

    // Ensure minimum 1.5 seconds loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    if (connectionCancelled.value) {
      return;
    }

    connectingModal.value.hide();
    emits('tab-panel', { action: 'ADD_PANEL', connection: newConnection });
  } catch (err) {
    if (connectionCancelled.value) {
      return;
    }

    // Ensure minimum 1.5 seconds loading time before showing error
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    if (connectionCancelled.value) {
      return;
    }

    // Show error in modal
    let errorMessage = '';
    if (err instanceof CustomError) {
      errorMessage = `status: ${err.status}, details: ${err.details}`;
    } else {
      errorMessage = lang.t('connection.unknownError') + ` details: ${err}`;
    }

    connectingModal.value.showError(errorMessage);
  }
};

// edit connect info
const editConnect = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing'); // eslint-disable-line no-console
    return;
  }
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value.showMedal(connection);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(connection);
  }
};

// clone connection
const cloneConnect = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing'); // eslint-disable-line no-console
    return;
  }

  const clonedConnection = cloneDeep(connection);
  clonedConnection.id = undefined;
  clonedConnection.name = `${connection.name} (copy)`;

  if (connection.type === DatabaseType.ELASTICSEARCH) {
    const esClone = clonedConnection as ElasticsearchConnection;
    esClone.indices = [];
    esClone.activeIndex = undefined;
    esClone.version = '';
    esClone.clusterName = '';
    esClone.clusterUuid = '';
    esConnectDialog.value.showMedal(esClone);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    const dynamoClone = clonedConnection as DynamoDBConnection;
    dynamoClone.indices = undefined;
    dynamoClone.keySchema = undefined;
    dynamodbConnectDialog.value.showMedal(dynamoClone);
  }
};

const removeConnect = (connection: Connection) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('dialogOps.removeNotice'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      try {
        await removeConnection(connection);
        message.success(lang.t('dialogOps.removeSuccess'));
      } catch (_error) {
        message.error(lang.t('connection.unknownError'));
      }
    },
  });
};

const showTypeSelect = ref(false);
const esConnectDialog = ref();
const dynamodbConnectDialog = ref();

const databaseTypes = [
  {
    label: 'Elasticsearch',
    value: DatabaseType.ELASTICSEARCH,
    icon: elasticsearch,
  },
  {
    label: 'DynamoDB',
    value: DatabaseType.DYNAMODB,
    icon: dynamoDB,
  },
];

const showDatabaseTypeSelect = () => {
  showTypeSelect.value = true;
};

const selectDatabaseType = (type: DatabaseType) => {
  showTypeSelect.value = false;
  if (type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value.showMedal(null);
  } else if (type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(null);
  }
};
</script>

<style scoped>
.connection-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.connection-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connections-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

.connections-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filter-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 320px;
}

.filter-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}

.filter-input {
  padding-left: 28px;
  padding-right: 28px;
}

.filter-clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.filter-clear-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}

.sort-trigger {
  gap: 6px;
  white-space: nowrap;
}

.sort-dropdown-content {
  min-width: 180px;
}

.sort-section-label {
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sort-item-label {
  flex: 1;
}

.sort-divider {
  height: 1px;
  background: hsl(var(--border));
  margin: 4px 8px;
}

.filter-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
}

.connection-scroll-container {
  flex: 1;
  height: 0;
  overflow: auto;
}

.connection-list-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, 240px);
  gap: 16px;
  padding: 16px;
}

.connection-card {
  width: 240px;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.connection-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: hsl(var(--primary) / 0.3);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: hsl(var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-info {
  min-height: 0;
  margin-bottom: 14px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: hsl(var(--foreground));
  margin-bottom: 4px;
}

.card-detail {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: auto;
  align-content: flex-start;
}

.card-badge {
  font-size: 11px;
  padding: 1px 8px;
  font-weight: 500;
}

.type-badge {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.06);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.database-type-dialog {
  max-width: 400px;
}

.database-type-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.database-type-btn {
  width: 100%;
  justify-content: flex-start;
  gap: 8px;
}

.database-type-icon {
  width: 20px;
  height: 20px;
}
</style>
