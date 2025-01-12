<template>
  <div class="tabs-container">
    <n-tabs
      type="card"
      v-model:value="activeTab"
      @close="handleCloseTab"
      @add="handleAddTab"
      closable
      addable
    >
      <n-tab-pane
        v-for="tab in tabs"
        :key="tab.name"
        :name="tab.name"
        :tab="`Query ${tab.index}`"
      >
        <div class="editor-container">
          <template v-if="databaseType === DatabaseType.ELASTICSEARCH">
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
          <template v-else-if="databaseType === DatabaseType.DYNAMODB">
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
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { AiStatus } from '@vicons/carbon';
import { NTabPane, NTabs } from 'naive-ui';
import { ref, watch } from 'vue';
import { DatabaseType, useConnectionStore } from '../../../store/connectionStore';
import Editor from '../../editor/index.vue';
import collectionSelector from './collection-selector.vue';
import { useSourceFileStore } from '../../../store';

const props = defineProps<{
  databaseType: DatabaseType;
  established: boolean;
}>();

const connectionStore = useConnectionStore();
const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;


const activeTab = ref('');
const tabs = ref<Array<{name: string, index: number}>>([]);

watch(() => props.established, (newVal) => {
  if (newVal && connectionStore.established) {
    if (!connectionStore.established.tabs?.length) {
      const newTabName = 'tab-1';
      const newTabs = [{
        name: newTabName,
        index: 1
      }];
      connectionStore.updateConnectionTabs(connectionStore.established.id, newTabs);
      connectionStore.updateConnectionActiveTab(connectionStore.established.id, newTabName);
    }
    tabs.value = connectionStore.established.tabs || [];
    activeTab.value = connectionStore.established.activeTab || '';
  }
}, { immediate: true });

const handleCloseTab = (name: string) => {
  const index = tabs.value.findIndex(tab => tab.name === name);
  if (index !== -1) {
    tabs.value.splice(index, 1);
    if (tabs.value.length && activeTab.value === name) {
      activeTab.value = tabs.value[tabs.value.length - 1].name;
    }
    if (connectionStore.established) {
      connectionStore.updateConnectionTabs(connectionStore.established.id, tabs.value);
      connectionStore.updateConnectionActiveTab(connectionStore.established.id, activeTab.value);
    }
  }
};

const handleAddTab = () => {
  const newTabName = `tab-${tabs.value.length + 1}`;
  tabs.value.push({
    name: newTabName,
    index: tabs.value.length + 1
  });
  activeTab.value = newTabName;
  if (connectionStore.established) {
    connectionStore.updateConnectionTabs(connectionStore.established.id, tabs.value);
    connectionStore.updateConnectionActiveTab(connectionStore.established.id, activeTab.value);
  }
};

const handleLoadAction = async () => {
  await readSourceFromFile(undefined);
};

watch(activeTab, (newVal) => {
  if (connectionStore.established && newVal) {
    connectionStore.updateConnectionActiveTab(connectionStore.established.id, newVal);
  }
});
</script>

<style lang="scss" scoped>
.tabs-container {
  height: calc(100% - 48px);
  display: flex;
  flex-direction: column;

  .editor-container {
    flex: 1;
    overflow: hidden;
    padding: 16px;
    position: relative;
  }

  :deep(.n-tabs) {
    flex: 1;
    display: flex;
    flex-direction: column;
    
    .n-tabs-nav {
      padding: 8px 8px 0;
      background: var(--n-color);
      
      .tab-prefix {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 12px;
        
        .tab-name {
          font-size: 14px;
          color: var(--text-color);
        }
      }
    }

    .n-tabs-content {
      flex: 1;
      overflow: hidden;
      padding: 0;
    }

    .n-tab-pane {
      height: 100%;
      
      .editor-container {
        height: 100%;
        padding: 0;

        .es-editor {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          
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
            position: relative;
          }
        }

        .dynamo-editor {
          width: 100%;
          height: 100%;
          padding: 16px;
          
          :deep(.n-tabs) {
            height: 100%;

            .n-tab-pane {
              height: calc(100% - 40px);
              padding: 16px 0;
            }
          }
        }
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
</style> 