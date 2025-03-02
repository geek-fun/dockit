<template>
  <n-tabs
    v-model:value="currentPanelName"
    type="card"
    :addable="false"
    :closable="closableRef"
    class="connect-tab-container"
    @close="handleClose"
  >
    <n-tab-pane
      v-for="panel in panelsRef"
      :key="panel.id"
      :name="panel.name"
      class="tab-pane-container"
    >
      <template v-if="panel.connection && panel.connection.type === DatabaseType.ELASTICSEARCH">
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
      <template v-else-if="panel.connection && panel.connection.type === DatabaseType.DYNAMODB">
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

      <connect-list v-else @tab-panel="tabPanelHandler" />
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { AiStatus } from '@vicons/carbon';
import { ref } from 'vue';
import { Connection, DatabaseType, useSourceFileStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import Editor from '../editor/index.vue';
import CollectionSelector from './components/collection-selector.vue';

type Panel = {
  id: number;
  name: string;
  connection?: Connection;
};

const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;

const currentPanelName = ref('home');
const panelsRef = ref<Array<Panel>>([{ id: 0, name: 'home' }]);

const tabPanelHandler = async ({
  action,
  connection,
}: {
  action: 'ADD_PANEL';
  connection: Connection;
}) => {
  if (action === 'ADD_PANEL') {
    const exists = panelsRef.value.filter(panelItem => panelItem.connection?.id === connection.id);
    const panelName = !exists.length ? connection.name : `${connection.name}-${exists.length}`;

    panelsRef.value.push({ id: panelsRef.value.length + 1, name: panelName, connection });

    currentPanelName.value = panelName;
  }
};

const closableRef = computed(() => {
  return panelsRef.value.length > 1;
});

const handleClose = (name: string) => {
  const { value: panels } = panelsRef;
  const nameIndex = panels.findIndex(({ name: panelName }) => panelName === name);
  if (!~nameIndex) return;
  // @todo save file content before close
  panels.splice(nameIndex, 1);

  if (name === currentPanelName.value) {
    currentPanelName.value = panels[Math.min(nameIndex, panels.length - 1)].name;
  }
};

const handleLoadAction = async () => {
  await readSourceFromFile(undefined);
};
</script>

<style lang="scss" scoped>
.connect-tab-container {
  width: 100%;
  height: 100%;

  .tab-pane-container {
    height: 100%;
    width: 100%;
    padding: 0;
    .es-editor {
      height: 100%;
      display: flex;
      flex-direction: column;
      .toolbar {
        display: flex;
        align-items: center;
        padding: 8px;
        .action-load-icon {
          cursor: pointer;
          margin-left: 8px;
        }
      }
      .es-editor-container {
        flex: 1;
        overflow: hidden;
        position: relative;
      }
    }
    .dynamo-editor {
      height: 100%;
      display: flex;
      flex-direction: column;
      .n-tabs {
        flex: 1;
        .n-tabs-nav {
          background: var(--n-color);
        }
      }
    }
  }
}
</style>
