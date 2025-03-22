<template>
  <n-tabs
    type="card"
    :addable="false"
    :value="activePanel.name"
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
          <tool-bar />
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
import { Connection, DatabaseType, useTabStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import Editor from '../editor/index.vue';
import ToolBar from '../../components/tool-bar.vue';
import { useLang } from '../../lang';
import { CustomError } from '../../common';

const route = useRoute();
const dialog = useDialog();
const message = useMessage();
const lang = useLang();

const tabStore = useTabStore();
const { establishPanel, closePanel, setActivePanel, checkFileExists } = tabStore;
const { panels, activePanel } = storeToRefs(tabStore);

const tabPanelHandler = async ({
  action,
  connection,
}: {
  action: 'ADD_PANEL';
  connection: Connection;
}) => {
  if (action === 'ADD_PANEL') {
    await establishPanel(connection);
  }
};

const handleTabChange = async (panelName: string, action: 'CHANGE' | 'CLOSE') => {
  const panel = panels.value.find(panel => panel.name === panelName);
  if (!panel) {
    return;
  }
  if (action === 'CHANGE') {
    setActivePanel(panel.id);
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
            await closePanel(panel, true);
            message.success(lang.t('dialogOps.fileSaveSuccess'));
          } catch (err) {
            message.error(
              lang.t('dialogOps.fileSaveFailed') + `details: ${(err as CustomError).details}`,
            );
          }
        },
        onNegativeClick: async () => {
          await closePanel(panel, false);
        },
      });
    } else {
      await closePanel(panel, true);
    }
  }
};

onMounted(async () => {
  if (route.params.filePath && route.params.filePath !== ':filePath') {
    await establishPanel(route.params.filePath as string);
  }
});
</script>

<style lang="scss" scoped>
.connect-tab-container {
  width: 100%;
  height: 100%;
  :deep(.n-tab-pane) {
    padding: 0;
  }

  :deep(.n-tabs-wrapper) {
    .n-tabs-tab-wrapper {
      background-color: var(--bg-color);
      .n-tabs-tab--active {
        background-color: var(--bg-color-secondary);
      }
    }
  }

  .tab-pane-container {
    width: 100%;
    height: 100%;
    background-color: var(--bg-color-secondary);
    .es-editor {
      height: 100%;
      display: flex;
      flex-direction: column;

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
      }
    }
  }
}
</style>
