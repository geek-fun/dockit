<template>
  <div class="connection-list-container">
    <div class="connection-scroll-container">
      <n-infinite-scroll style="height: 100%">
        <div class="connection-list-body">
          <n-card
            v-for="connection in connections"
            :key="connection.id"
            :title="connection.name"
            hoverable
            @dblclick="handleSelect('connect', connection)"
          >
            <template #header-extra>
              <n-icon size="24">
                <component :is="getDatabaseIcon(connection.type)" />
              </n-icon>
              <div class="operation" @click.stop="">
                <n-dropdown
                  trigger="click"
                  :options="options"
                  @select="(args: string) => handleSelect(args, connection)"
                >
                  <n-icon size="25">
                    <MoreOutlined />
                  </n-icon>
                </n-dropdown>
              </div>
            </template>
          </n-card>
        </div>
      </n-infinite-scroll>
    </div>
  </div>

  <n-modal v-model:show="showTypeSelect">
    <n-card style="width: 400px" :title="$t('connection.selectDatabase')">
      <n-space vertical>
        <n-button
          v-for="type in databaseTypes"
          :key="type.value"
          block
          @click="selectDatabaseType(type.value)"
        >
          <template #icon>
            <component :is="type.icon" />
          </template>
          {{ type.label }}
        </n-button>
      </n-space>
    </n-card>
  </n-modal>

  <floating-menu @add="showDatabaseTypeSelect" />
  <es-connect-dialog ref="esConnectDialog" />
  <dynamodb-connect-dialog ref="dynamodbConnectDialog" />
  <connecting-modal ref="connectingModal" />
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { NDropdown, NIcon, useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import { Connection, DatabaseType, useConnectionStore } from '../../../store';
import { MoreOutlined } from '@vicons/antd';
import FloatingMenu from './floating-menu.vue';
import EsConnectDialog from './es-connect-dialog.vue';
import DynamodbConnectDialog from './dynamodb-connect-dialog.vue';
import ConnectingModal from './connecting-modal.vue';

const emits = defineEmits(['tab-panel']);

const dialog = useDialog();
const message = useMessage();
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

<style lang="scss" scoped>
.connection-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .connection-scroll-container {
    flex: 1;
    height: 0;

    .connection-list-body {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding: 16px;

      .n-card {
        max-width: 300px;
      }

      .n-card:hover {
        cursor: pointer;
      }
    }
  }
}
</style>
