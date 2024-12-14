<template>
  <div class="connect-container">
    <div class="connect-header">
      <n-button type="primary" @click="showDatabaseTypeSelect">
        {{ $t('connection.add') }}
      </n-button>
    </div>
    
    <n-list class="connection-list">
      <n-list-item v-for="connection in connections" :key="connection.id">
        <n-thing>
          <template #avatar>
            <n-icon size="24">
              <component :is="getDatabaseIcon(connection.type)" />
            </n-icon>
          </template>
          <template #header>
            {{ connection.name }}
          </template>
          <template #description>
            {{ getDatabaseTypeLabel(connection.type) }}
          </template>
        </n-thing>
        <template #suffix>
          <n-space>
            <n-button @click="editConnection(connection)">
              {{ $t('connection.edit') }}
            </n-button>
            <n-button @click="deleteConnection(connection)">
              {{ $t('connection.delete') }}
            </n-button>
          </n-space>
        </template>
      </n-list-item>
    </n-list>
    
    <!-- Database Type Selection Dialog -->
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
    
    <!-- Connection Dialogs -->
    <connect-dialog ref="esConnectDialog" />
    <dynamodb-connect-dialog ref="dynamodbConnectDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { Connection, useConnectionStore } from '../../store/connectionStore';
import { DatabaseType } from '../../common/constants';
import ConnectDialog from './components/connect-dialog.vue';
import DynamodbConnectDialog from './components/dynamodb-connect-dialog.vue';
import  dynamoDB  from '../../assets/svg/dynamoDB.svg'
import  elasticsearch from '../../assets/svg/elasticsearch.svg'

const connectionStore = useConnectionStore();
const { connections } = storeToRefs(connectionStore);

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

const getDatabaseIcon = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? elasticsearch : dynamoDB;
};

const getDatabaseTypeLabel = (type: DatabaseType) => {
  return type === DatabaseType.ELASTICSEARCH ? 'Elasticsearch' : 'DynamoDB';
};

const editConnection = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing');
    return;
  }
  
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value?.showMedal(connection);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value?.showMedal(connection);
  }
};

const deleteConnection = async (connection: Connection) => {
  try {
    await connectionStore.removeConnection(connection);
    message.success(lang.t('connection.deleteSuccess'));
  } catch (error) {
    if (error instanceof Error) {
      message.error(error.message);
    } else {
      message.error(lang.t('connection.unknownError'));
    }
  }
};

// ... rest of the component code
</script>

<style lang="scss" scoped>
.connect-container {
  height: 100%;
  width: 100%;
  display: flex;

  .connect-list {
    width: 200px;
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;

    .add-connect {
      height: 30px;
      margin: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      color: #fff;
      background-color: var(--theme-color);
      transition: 0.3s;
      cursor: pointer;

      &:hover {
        background-color: var(--theme-color-hover);
      }
    }
  }

  .connect-body {
    flex: 1;
    width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;

    .connect-toolbar {
      display: flex;
      align-items: center;
      height: var(--tool-bar-height);
      border-bottom: 1px solid var(--border-color);

      .action-load-icon {
        margin-left: 10px;
        cursor: pointer;
        color: gray;

        &:hover {
          color: var(--theme-color);
        }
      }
    }

    .editor-container {
      flex: 1;
      height: 0;
    }
  }
}
</style>
