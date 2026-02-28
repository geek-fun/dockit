<template>
  <div class="connection-list-container">
    <div class="connection-scroll-container">
      <div class="connection-list-body">
        <div
          v-for="connection in connections"
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
import { ref } from 'vue';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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

const emits = defineEmits(['tab-panel']);

const dialog = useDialogService();
const message = useMessageService();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, freshConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);
fetchConnections();

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

const handleSelect = (key: string, connection: Connection) => {
  switch (key) {
    case 'connect':
      establishConnect(connection);
      break;
    case 'edit':
      editConnect(connection);
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
  height: 180px;
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
  gap: 6px;
  margin-bottom: auto;
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
