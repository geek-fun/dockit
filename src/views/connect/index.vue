<template>
  <n-tabs
    type="card"
    :addable="false"
    :value="activePanelName"
    class="connect-tab-container"
    @close="value => handleTabChange(value, 'CLOSE')"
    @update:value="value => handleTabChange(value, 'CHANGE')"
  >
    <n-tab-pane
      v-for="(panel, index) in panels"
      :closable="index > 0"
      :key="panel.id"
      :name="panel.name"
      class="tab-pane-container"
    >
      <connect-list v-if="panel.id === 0" @tab-panel="tabPanelHandler" />
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
      <template v-else>
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
    </n-tab-pane>
  </n-tabs>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { AiStatus } from '@vicons/carbon';
import { Connection, DatabaseType, useSourceFileStore, useTabStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import Editor from '../editor/index.vue';
import CollectionSelector from './components/collection-selector.vue';
import { useLang } from '../../lang';

const route = useRoute();
const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;

const tabStore = useTabStore();
const { establishPanel, closePanel, setActivePanel, checkFileExists } = tabStore;
const { panels, activePanelId } = storeToRefs(tabStore);

const activePanelName = computed(
  () => panels.value.find(panel => panel.id === activePanelId.value)?.name,
);

watch(activePanelName, name => {
  const panel = panels.value.find(panel => panel.name === name);
  if (panel) {
    setActivePanel(panel.id, panel.content ?? '');
  }
});

const tabPanelHandler = async ({
  action,
  connection,
}: {
  action: 'ADD_PANEL';
  connection: Connection;
}) => {
  if (action === 'ADD_PANEL') {
    establishPanel(connection);
  }
};

const handleTabChange = async (panelName: string, action: 'CHANGE' | 'CLOSE') => {
  const panel = panels.value.find(panel => panel.name === panelName);
  if (!panel) {
    return;
  }
  if (action === 'CHANGE') {
    if (panel) {
      setActivePanel(panel.id, panel.content ?? '');
    }
  } else if (action === 'CLOSE') {
    const exists = await checkFileExists(panel);
    if (!exists) {
      dialog.warning({
        title: lang.t('file.saveFileBeforeClose.title'),
        content: lang.t('file.saveFileBeforeClose.content'),
        positiveText: lang.t('file.saveFileBeforeClose.positiveText'),
        negativeText: lang.t('file.saveFileBeforeClose.negativeText'),
        onPositiveClick: async () => {
          try {
            closePanel(panel, true);
            message.success(lang.t('file.saveFileBeforeClose.success'));
          } catch (err) {
            message.error(lang.t('file.saveFileBeforeClose.failed') + ': ' + err);
          }
        },
        onNegativeClick: () => {
          closePanel(panel, true);
        },
      });
    }
  }
};

const handleLoadAction = async () => {
  await readSourceFromFile(undefined);
};

onMounted(async () => {
  if (route.params.filePath && route.params.filePath !== ':filePath') {
    establishPanel(route.params.filePath as string);
  }
});
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
