<template>
  <div class="connect-container">
    <div class="connect-list">
      <div class="connect-header">
        <n-button type="primary" @click="showDatabaseTypeSelect">
          {{ $t('connection.new') }}
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
            <n-dropdown
              trigger="hover"
              :options="getDropdownOptions(connection)"
              placement="bottom-start"
            >
              <n-button text>
                <template #icon>
                  <n-icon size="18">
                    <OverflowMenuVertical />
                  </n-icon>
                </template>
              </n-button>
            </n-dropdown>
          </template>
        </n-list-item>
      </n-list>
    </div>

    <div class="connect-body">
      <template v-if="connections.length === 0">
        <div class="empty-container">
          <n-empty :description="$t('connection.emptyState.pleaseSelect')" />
        </div>
      </template>
      <template v-else-if="established">
        <div class="connect-toolbar">
          <n-breadcrumb>
            <n-breadcrumb-item>{{ established.name }}</n-breadcrumb-item>
          </n-breadcrumb>
        </div>
        <div class="editor-container">
          <template v-if="established.type === DatabaseType.ELASTICSEARCH">
            <div class="es-editor">
              <div class="toolbar">
                <collection-selector />
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-icon size="20" class="action-load-icon" @click="handleLoadAction">
                      <AiStatus />
                    </n-icon>
                  </template>
                  {{ $t('editor.loadDefault') }}
                </n-tooltip>
                <path-breadcrumb :clickable="false" />
              </div>
              <div class="es-editor-container">
                <Editor />
              </div>
            </div>
          </template>
          <template v-else-if="established.type === DatabaseType.DYNAMODB">
            <div class="dynamo-editor">
              <n-tabs type="segment">
                <n-tab-pane name="query" tab="Query">
                  <n-empty :description="$t('connection.dynamodb.queryComingSoon')" />
                </n-tab-pane>
                <n-tab-pane name="tables" tab="Tables">
                  <n-empty :description="$t('connection.dynamodb.tablesComingSoon')" />
                </n-tab-pane>
              </n-tabs>
            </div>
          </template>
        </div>
      </template>
    </div>

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
import { useLang } from '../../lang';
import dynamoDB from '../../assets/svg/dynamoDB.svg';
import collectionSelector from './components/collection-selector.vue';
import elasticsearch from '../../assets/svg/elasticsearch.svg';
import { useMessage } from 'naive-ui';
import { OverflowMenuVertical, AiStatus } from '@vicons/carbon';
import Editor from '../editor/index.vue';
import { NTabs, NTabPane, NBreadcrumb, NBreadcrumbItem } from 'naive-ui';
import { useSourceFileStore } from '../../store';


const connectionStore = useConnectionStore();
const { connections, established } = storeToRefs(connectionStore);
const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;

const message = useMessage();
const lang = useLang();
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

const establishConnect = async (connection: Connection) => {
  try {
    await connectionStore.establishConnection(connection);
    message.success(lang.t('connection.connectSuccess'));
  } catch (error) {
    if (error instanceof Error) {
      message.error(error.message);
    } else {
      message.error(lang.t('connection.unknownError'));
    }
  }
};

const getDropdownOptions = (connection: Connection) => [
  {
    label: lang.t('connection.operations.connect'),
    key: 'connect',
    props: {
      onClick: () => establishConnect(connection)
    }
  },
  {
    label: lang.t('connection.operations.edit'),
    key: 'edit',
    props: {
      onClick: () => editConnection(connection)
    }
  },
  {
    label: lang.t('connection.operations.remove'),
    key: 'remove',
    props: {
      onClick: () => deleteConnection(connection)
    }
  }
];

const handleLoadAction = async () => {
  await readSourceFromFile(undefined);
};

</script>

<style lang="scss" scoped>
.connect-container {
  height: 100%;
  width: 100%;
  display: flex;
  overflow: hidden;

  .connect-list {
    width: 25%;
    display: flex;
    flex-direction: column;
    background-color: rgb(250, 250, 252);
    
    .connect-header {
      padding: 16px;
      background-color: rgb(250, 250, 252);
      border-bottom: 1px solid var(--n-border-color);
    }

    .connection-list {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      background-color: rgb(250, 250, 252);

      :deep(.n-list-item) {
        padding: 8px 16px;
        cursor: pointer;
        
        &:hover {
          background-color: #ffffff;
        }

        .n-thing {
          display: flex;
          align-items: center;
          flex: 1;
          margin-right: 8px;
        }

        .n-dropdown {
          opacity: 0.7;
          transition: opacity 0.2s;
          
          &:hover {
            opacity: 1;
          }
        }
      }
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
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 1px;
      background-color: var(--n-border-color);
      z-index: 1;
    }
    
    .connect-toolbar {
      height: 48px;
      padding: 0 16px;
      display: flex;
      align-items: center;
    }

    .editor-container {
      flex: 1;
      overflow: hidden;
      padding: 16px;
      position: relative;

      .es-editor {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        position: absolute;
        left: 16px;
        right: 16px;
        top: 16px;
        bottom: 16px;
        
        .toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          flex-shrink: 0;
        }
        
        .es-editor-container {
          flex: 1;
          height: 0;
        }
      }

      .dynamo-editor {
        width: 100%;
        
        :deep(.n-tabs) {
          height: 100%;

          .n-tab-pane {
            height: calc(100% - 40px);
            padding: 16px 0;
          }
        }
      }
    }

    .empty-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
}

.es-editor {
  .path-display {
    margin-bottom: 16px;
    cursor: pointer;
    
    :deep(.n-input) {
      .n-input__input-el {
        cursor: pointer;
      }
    }
    
    &:hover {
      :deep(.n-input) {
        border-color: var(--n-primary-color);
      }
    }
  }
}
</style>
