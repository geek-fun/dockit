<template>
  <n-dialog-provider>
    <div class="connect-container">
      <div class="connect-list">
        <connect-list @edit-connect="editConnectHandler" />
      </div>

      <div class="connect-body">
        <template v-if="!established || !connections.length">
          <div class="empty-container">
            <n-empty :description="$t('connection.emptyState.pleaseSelect')" />
          </div>
        </template>
        <template v-else>
          <div class="connect-toolbar">
            <div class="breadcrumb">
              <span class="breadcrumb-item">{{ established.name }}</span>
            </div>
          </div>
          <query-tabs
            :database-type="established.type"
            :established="!!established"
          />
        </template>
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
      
      <es-connect-dialog ref="esConnectDialog" />
      <dynamodb-connect-dialog ref="dynamodbConnectDialog" />
      <floating-add-button @add="showDatabaseTypeSelect" />
    </div>
  </n-dialog-provider>
</template>

<script setup lang="ts">
import { NDialogProvider } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import dynamoDB from '../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../assets/svg/elasticsearch.svg';
import { Connection, DatabaseType, useConnectionStore } from '../../store/connectionStore';
import ConnectList from './components/connect-list.vue';
import DynamodbConnectDialog from './components/dynamodb-connect-dialog.vue';
import EsConnectDialog from './components/es-connect-dialog.vue';
import FloatingAddButton from './components/floating-add-button.vue';
import QueryTabs from './components/query-tabs.vue';

const connectionStore = useConnectionStore();
const { connections, established } = storeToRefs(connectionStore);

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

const editConnectHandler = (connection: Connection) => {
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    esConnectDialog.value.showMedal(connection);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(connection);
  }
};

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
.connect-container {
  height: 100%;
  width: 100%;
  display: flex;
  overflow: hidden;
  position: relative;

  .connect-list {
    width: 20%;
    display: flex;
    flex-direction: column;
    background-color: var(--n-color);
    border-right: 1px solid var(--border-color);
    
    .connect-header {
      padding: 16px;
      border-bottom: 1px solid var(--n-border-color);
    }
  }

  .connect-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--n-color);
    position: relative;
    
    &::after {
      display: none;
    }
    
    .connect-toolbar {
      height: 48px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--n-border-color);

      .breadcrumb {
        .breadcrumb-item {
          color: var(--text-color);
          font-size: 14px;
        }
      }
    }
  }
}
</style>
