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
import { AiStatus } from '@vicons/carbon';
import { NBreadcrumb, NBreadcrumbItem, NDialogProvider, NTabPane, NTabs } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import dynamoDB from '../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../assets/svg/elasticsearch.svg';
import { DatabaseType } from '../../common/constants';
import { useSourceFileStore } from '../../store';
import { Connection, useConnectionStore } from '../../store/connectionStore';
import Editor from '../editor/index.vue';
import collectionSelector from './components/collection-selector.vue';
import EsConnectDialog from './components/es-connect-dialog.vue';
import ConnectList from './components/connect-list.vue';
import DynamodbConnectDialog from './components/dynamodb-connect-dialog.vue';
import FloatingAddButton from './components/floating-add-button.vue';


const connectionStore = useConnectionStore();
const { connections, established } = storeToRefs(connectionStore);
const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;

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
</style>
