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
          <dynamo-editor :ref="el => setDynamoEditorRef(el, panel.id)" />
        </div>
      </template>
      <template v-else-if="panel.connection && panel.connection.type === DatabaseType.MONGODB">
        <div class="mongo-editor">
          <tool-bar
            :ref="el => setToolBarRef(el, panel.id)"
            type="MONGO_EDITOR"
            @insert-sample-query="handleInsertMongoSampleQuery"
            @execute-mongo-query="handleExecuteMongoQuery"
          />
          <div class="mongo-editor-container">
            <mongo-editor :ref="el => setMongoEditorRef(el, panel.id)" />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="es-editor">
          <tool-bar
            :ref="el => setToolBarRef(el, panel.id)"
            type="ES_EDITOR"
            @insert-sample-query="handleInsertSampleQuery"
          />
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
import { Connection, DatabaseType, useTabStore, useDbDataStore } from '../../store';
import ConnectList from './components/connect-list.vue';
import EsEditor from '../editor/es-editor/index.vue';
import DynamoEditor from '../editor/dynamo-editor/index.vue';
import MongoEditor from '../editor/mongo-editor/index.vue';
import ToolBar from '../../components/tool-bar.vue';
import { useLang } from '../../lang';
import { CustomError } from '../../common';
import { useDialogService, useMessageService, setupGlobalShortcuts } from '@/composables';

const route = useRoute();
const dialog = useDialogService();
const message = useMessageService();
const lang = useLang();

const tabStore = useTabStore();
const { establishPanel, closePanel, setActivePanel, checkFileExists, clearPendingInsertQuery } =
  tabStore;
const { panels, activePanel, pendingInsertQuery } = storeToRefs(tabStore);

const dbDataStore = useDbDataStore();

const esEditorRefs = new Map<number, InstanceType<typeof EsEditor>>();
const toolBarRefs = new Map<number, InstanceType<typeof ToolBar>>();
const dynamoEditorRefs = new Map<number, InstanceType<typeof DynamoEditor>>();
const mongoEditorRefs = new Map<number, InstanceType<typeof MongoEditor>>();
let cleanupGlobalShortcuts: (() => void) | null = null;

const setEditorRef = (el: any, panelId: number) => {
  if (el) {
    esEditorRefs.set(panelId, el);
  } else {
    esEditorRefs.delete(panelId);
  }
};

const setToolBarRef = (el: any, panelId: number) => {
  if (el) {
    toolBarRefs.set(panelId, el);
  } else {
    toolBarRefs.delete(panelId);
  }
};

const setDynamoEditorRef = (el: any, panelId: number) => {
  if (el) {
    dynamoEditorRefs.set(panelId, el);
  } else {
    dynamoEditorRefs.delete(panelId);
  }
};

const setMongoEditorRef = (el: any, panelId: number) => {
  if (el) {
    mongoEditorRefs.set(panelId, el);
  } else {
    mongoEditorRefs.delete(panelId);
  }
};

const handleInsertSampleQuery = (query: string) => {
  const editor = esEditorRefs.get(activePanel.value.id);
  editor?.insertSampleQuery(query);
};

const handleInsertMongoSampleQuery = (query: string) => {
  const editor = mongoEditorRefs.get(activePanel.value.id);
  editor?.insertSampleQuery(query);
};

const handleExecuteMongoQuery = () => {
  const editor = mongoEditorRefs.get(activePanel.value.id);
  editor?.executeCurrentStatement();
};

const handleToggleShortcutsDialog = () => {
  const panelId = activePanel.value.id;
  const esToolBar = toolBarRefs.get(panelId);
  if (esToolBar) {
    esToolBar.toggleShortcutsDialog();
  } else if (dynamoEditorRefs.has(panelId)) {
    dynamoEditorRefs.get(panelId)?.toggleShortcutsDialog();
  }
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
    const isDynamo = panel.connection?.type === DatabaseType.DYNAMODB;
    const exists = await checkFileExists(panel);
    if (!exists) {
      dialog.warning({
        title: lang.t('file.saveFileBeforeClose.title'),
        content: lang.t('file.saveFileBeforeClose.content'),
        positiveText: lang.t('file.saveFileBeforeClose.positiveText'),
        negativeText: lang.t('file.saveFileBeforeClose.negativeText'),
        positiveVariant: 'default',
        negativeVariant: 'destructive',
        onPositiveClick: async () => {
          try {
            await closePanel(panel, true);
            if (isDynamo) dbDataStore.resetDynamoData();
            message.success(lang.t('dialogOps.fileSaveSuccess'));
          } catch (err) {
            message.error(
              lang.t('dialogOps.fileSaveFailed') + `details: ${(err as CustomError).details}`,
            );
          }
        },
        onNegativeClick: async () => {
          await closePanel(panel, false);
          if (isDynamo) dbDataStore.resetDynamoData();
        },
      });
    } else {
      await closePanel(panel, true);
      if (isDynamo) dbDataStore.resetDynamoData();
    }
  }
};

// Watch for pending query insertion from history view
watch(pendingInsertQuery, async query => {
  if (!query || activePanel.value.id === 0) return;

  const connectionType = activePanel.value.connection?.type;
  const panelId = activePanel.value.id;

  // Wait for editor to be mounted (may need multiple attempts for newly created panels)
  const insertQuery = async (retries = 0): Promise<boolean> => {
    await nextTick();

    // Insert query based on database type
    if (connectionType === DatabaseType.DYNAMODB) {
      const dynamoEditor = dynamoEditorRefs.get(panelId);
      if (dynamoEditor) {
        (dynamoEditor as any).insertPartiqlSample?.(query);
        return true;
      }
    } else if (connectionType === DatabaseType.MONGODB) {
      const editor = mongoEditorRefs.get(panelId);
      if (editor) {
        editor.insertSampleQuery(query);
        return true;
      }
    } else {
      // ES, OpenSearch, EasySearch
      const editor = esEditorRefs.get(panelId);
      if (editor) {
        editor.insertSampleQuery(query);
        return true;
      }
    }

    // Retry if editor ref not available yet (up to 5 times with 100ms delay)
    if (retries < 5) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return insertQuery(retries + 1);
    }

    return false;
  };

  await insertQuery();
  clearPendingInsertQuery();
});

onMounted(async () => {
  // Global shortcuts work when any editor tab is active (not the connect-list)
  cleanupGlobalShortcuts = setupGlobalShortcuts({
    shortcuts: [
      {
        key: ['/', '?'],
        ctrlOrMeta: true,
        shift: true,
        handler: handleToggleShortcutsDialog,
      },
    ],
    isActive: () => activePanel.value.id !== 0,
  });

  if (route.params.filePath && route.params.filePath !== ':filePath') {
    await establishPanel(route.params.filePath as string);
  }
});

onUnmounted(() => {
  cleanupGlobalShortcuts?.();
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

.mongo-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mongo-editor-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}
</style>
