<template>
  <Tabs
    :model-value="activePanel.name"
    class="connect-tab-container"
    @update:model-value="value => handleTabChange(value as string, 'CHANGE')"
  >
    <TabsList class="tabs-list">
      <div v-for="(panel, index) in panels" :key="panel.id" class="tab-trigger-wrapper">
        <TabsTrigger :value="panel.name" class="tab-trigger">
          {{ panel.name }}
        </TabsTrigger>
        <button
          v-if="index > 0"
          class="tab-close-btn"
          @click.stop="handleTabChange(panel.name, 'CLOSE')"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </TabsList>
    <TabsContent
      v-for="panel in panels"
      :key="panel.id"
      :value="panel.name"
      class="tab-pane-container"
    >
      <connect-list v-if="panel.id === 0" @tab-panel="tabPanelHandler" />
      <template v-else-if="panel.connection && panel.connection.type === DatabaseType.DYNAMODB">
        <div class="dynamo-editor">
          <dynamo-editor />
        </div>
      </template>
      <template v-else>
        <div class="es-editor">
          <tool-bar type="ES_EDITOR" @insert-sample-query="handleInsertSampleQuery" />
          <div class="es-editor-container">
            <es-editor :ref="el => setEditorRef(el, panel.id)" />
          </div>
        </div>
      </template>
    </TabsContent>
  </Tabs>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { X } from 'lucide-vue-next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Connection, DatabaseType, useTabStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import EsEditor from '../editor/es-editor/index.vue';
import DynamoEditor from '../editor/dynamo-editor/index.vue';
import ToolBar from '../../components/tool-bar.vue';
import { useLang } from '../../lang';
import { CustomError } from '../../common';
import { useDialogService, useMessageService } from '@/composables';

const route = useRoute();
const dialog = useDialogService();
const message = useMessageService();
const lang = useLang();

const tabStore = useTabStore();
const { establishPanel, closePanel, setActivePanel, checkFileExists } = tabStore;
const { panels, activePanel } = storeToRefs(tabStore);

const esEditorRefs = new Map<number, InstanceType<typeof EsEditor>>();

const setEditorRef = (el: any, panelId: number) => {
  if (el) {
    esEditorRefs.set(panelId, el);
  } else {
    esEditorRefs.delete(panelId);
  }
};

const handleInsertSampleQuery = (query: string) => {
  const editor = esEditorRefs.get(activePanel.value.id);
  editor?.insertSampleQuery(query);
};

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

<style scoped>
.connect-tab-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs-list {
  flex-shrink: 0;
  width: 100%;
  justify-content: flex-start;
  background-color: hsl(var(--muted));
  border-radius: 0;
  height: auto;
  padding: 0;
  border-bottom: 1px solid hsl(var(--border));
}

.tab-trigger-wrapper {
  display: flex;
  align-items: center;
  position: relative;
}

.tab-trigger {
  border-radius: 0;
  padding: 8px 24px 8px 12px;
}

.tab-trigger[data-state='active'] {
  background-color: hsl(var(--card));
}

.tab-close-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  color: inherit;
  opacity: 0.6;
}

.tab-close-btn:hover {
  opacity: 1;
}

.tab-pane-container {
  width: 100%;
  flex: 1;
  background-color: hsl(var(--card));
  margin-top: 0;
  overflow: hidden;
}

.es-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.es-editor-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.dynamo-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
