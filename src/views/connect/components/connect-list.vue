<template>
  <div class="connection-list-container">
    <div class="connection-scroll-container">
      <div class="connection-list-body">
        <Card
          v-for="connection in connections"
          :key="connection.id"
          class="connection-card"
          @dblclick="handleSelect('connect', connection)"
        >
          <CardHeader class="connection-card-header">
            <div class="connection-card-header-content">
              <CardTitle class="connection-card-title">{{ connection.name }}</CardTitle>
              <div class="connection-card-actions">
                <component :is="getDatabaseIcon(connection.type)" class="h-6 w-6" />
                <div class="operation" @click.stop="">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="dropdown-trigger-btn">
                        <span class="i-carbon-overflow-menu-vertical h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        v-for="option in options"
                        :key="option.key"
                        @click="handleSelect(option.key, connection)"
                      >
                        {{ option.label }}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
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

  <floating-menu @add="showDatabaseTypeSelect" />
  <es-connect-dialog ref="esConnectDialog" />
  <dynamodb-connect-dialog ref="dynamodbConnectDialog" />
  <connecting-modal ref="connectingModal" />
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDialogService, useMessageService } from '@/composables';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import { Connection, DatabaseType, useConnectionStore } from '../../../store';
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

const options = reactive([
  { key: 'connect', label: lang.t('connection.operations.connect') },
  { key: 'edit', label: lang.t('connection.operations.edit') },
  { key: 'remove', label: lang.t('connection.operations.remove') },
]);

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
    console.error('Connection type is missing');
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
      } catch (error) {
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
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
}

.connection-card {
  max-width: 300px;
  min-width: 200px;
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}

.connection-card:hover {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.connection-card-header {
  padding: 16px;
}

.connection-card-header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.connection-card-title {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.connection-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operation {
  display: flex;
  align-items: center;
}

.dropdown-trigger-btn {
  width: 32px;
  height: 32px;
  padding: 0;
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
