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
            :class="{ active: established && connection.id === established.id }"
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
</template>

<script setup lang="ts">
import { NDropdown, NIcon, useDialog, useMessage } from 'naive-ui';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { Connection, DatabaseType, useConnectionStore } from '../../../store';
import { MoreOutlined } from '@vicons/antd';
import FloatingMenu from './floating-menu.vue';
import EsConnectDialog from './es-connect-dialog.vue';
import DynamodbConnectDialog from './dynamodb-connect-dialog.vue';

const emits = defineEmits(['tab-panel']);

const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, establishConnection } = connectionStore;
const { connections, established } = storeToRefs(connectionStore);
fetchConnections();

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
  try {
    await establishConnection(connection);
    message.success(lang.t('connection.connectSuccess'));
    emits('tab-panel', { action: 'ADD_PANEL', connection });
  } catch (err) {
    if (err instanceof CustomError) {
      message.error(`status: ${err.status}, details: ${err.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    } else {
      message.error(lang.t('connection.unknownError') + `details: ${err}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
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
