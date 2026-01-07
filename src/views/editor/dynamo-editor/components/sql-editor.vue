<template>
  <n-split direction="horizontal" class="partiql-editor" v-model:size="editorSize">
    <template #1>
      <div class="editor-container">
        <div class="editor-toolbar">
          <n-button-group size="small">
            <n-dropdown
              trigger="click"
              :options="sampleQueryOptions"
              @select="insertSampleQuery"
            >
              <n-button quaternary>
                <template #icon>
                  <n-icon><Code /></n-icon>
                </template>
                {{ $t('editor.dynamo.partiql.samples') }}
              </n-button>
            </n-dropdown>
          </n-button-group>
          <n-button
            type="primary"
            size="small"
            @click="executeQuery"
            :loading="loadingRef"
            :disabled="!activeConnection"
          >
            <template #icon>
              <n-icon><PlayFilledAlt /></n-icon>
            </template>
            {{ $t('dialogOps.execute') }}
          </n-button>
        </div>
        <div id="partiql-editor" ref="editorRef" class="monaco-editor-container" />
      </div>
    </template>
    <template #2>
      <div class="result-container">
        <n-card
          v-if="errorMessage"
          class="error-card"
          :title="$t('editor.dynamo.partiql.error')"
        >
          <n-text type="error">{{ errorMessage }}</n-text>
        </n-card>
        <n-card
          v-else-if="queryResult"
          :title="$t('editor.dynamo.resultTitle')"
          class="result-card"
        >
          <template #header-extra>
            <n-text depth="3">
              {{ $t('editor.dynamo.partiql.itemsReturned', { count: queryResult.count }) }}
            </n-text>
          </template>
          <div class="table-container">
            <n-data-table
              :bordered="false"
              :single-line="false"
              :columns="resultColumns"
              :data="queryResult.items"
              :max-height="400"
              :scroll-x="800"
              virtual-scroll
            />
          </div>
          <template #footer v-if="queryResult.next_token">
            <n-button
              size="small"
              @click="loadMore"
              :loading="loadingRef"
            >
              {{ $t('editor.dynamo.partiql.loadMore') }}
            </n-button>
          </template>
        </n-card>
        <n-empty
          v-else
          :description="$t('editor.dynamo.partiql.noResults')"
          class="empty-state"
        />
      </div>
    </template>
  </n-split>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import { Code, PlayFilledAlt } from '@vicons/carbon';
import { DataTableColumn, useMessage } from 'naive-ui';
import { DynamoDBConnection, useAppStore, useTabStore } from '../../../../store';
import { dynamoApi, PartiQLResult } from '../../../../datasources';
import { CustomError, jsonify } from '../../../../common';
import {
  Editor,
  monaco,
  setPartiqlDynamicOptions,
  partiqlSampleQueries,
} from '../../../../common/monaco';
import { useLang } from '../../../../lang';

const lang = useLang();
const message = useMessage();

const appStore = useAppStore();
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

const tabStore = useTabStore();
const { saveContent } = tabStore;
const { activePanel, activeConnection } = storeToRefs(tabStore);

let editor: Editor | null = null;
const editorRef = ref<HTMLElement>();
const editorSize = ref(0.6);
const loadingRef = ref(false);
const errorMessage = ref<string | null>(null);
const queryResult = ref<PartiQLResult | null>(null);
const currentNextToken = ref<string | null>(null);

// Sample query options for dropdown
const sampleQueryOptions = computed(() => [
  {
    label: lang.t('editor.dynamo.partiql.sampleSelectPk'),
    key: 'selectWithPartitionKey',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleSelectSk'),
    key: 'selectWithSortKey',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleScan'),
    key: 'scanAll',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleInsert'),
    key: 'insertItem',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleUpdate'),
    key: 'updateItem',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleDelete'),
    key: 'deleteItem',
  },
]);

// Generate columns dynamically from query results
const resultColumns = computed<DataTableColumn[]>(() => {
  if (!queryResult.value?.items?.length) return [];

  // Collect all unique keys from all items
  const allKeys = new Set<string>();
  queryResult.value.items.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });

  return Array.from(allKeys).map(key => ({
    title: key,
    key,
    ellipsis: { tooltip: true },
    render: (row: Record<string, unknown>) => {
      const value = row[key];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'object') return jsonify.stringify(value);
      return String(value);
    },
  }));
});

// Insert sample query into editor
const insertSampleQuery = (key: string) => {
  if (!editor) return;

  const query = partiqlSampleQueries[key as keyof typeof partiqlSampleQueries];
  if (!query) return;

  // Replace tablename with actual table name if connection is active
  let queryText = query;
  if (activeConnection.value) {
    const con = activeConnection.value as DynamoDBConnection;
    queryText = query.replace(/"tablename"/g, `"${con.tableName}"`);
  }

  const model = editor.getModel();
  if (model) {
    const position = editor.getPosition();
    if (position) {
      model.pushEditOperations(
        [],
        [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column,
            ),
            text: queryText,
          },
        ],
        () => null,
      );
    }
  }
};

// Execute the PartiQL query
const executeQuery = async () => {
  if (!editor || !activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  const statement = editor.getModel()?.getValue()?.trim();
  if (!statement) {
    message.warning(lang.t('editor.dynamo.partiql.emptyStatement'));
    return;
  }

  loadingRef.value = true;
  errorMessage.value = null;
  queryResult.value = null;
  currentNextToken.value = null;

  try {
    const result = await dynamoApi.executeStatement(
      activeConnection.value as DynamoDBConnection,
      { statement },
    );
    queryResult.value = result;
    currentNextToken.value = result.next_token;
    editorSize.value = 0.5;
  } catch (err) {
    const error = err as CustomError;
    errorMessage.value = error.details || error.message || String(err);
    message.error(`Error: ${errorMessage.value}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  } finally {
    loadingRef.value = false;
  }
};

// Load more results with pagination
const loadMore = async () => {
  if (!editor || !activeConnection.value || !currentNextToken.value) return;

  const statement = editor.getModel()?.getValue()?.trim();
  if (!statement) return;

  loadingRef.value = true;

  try {
    const result = await dynamoApi.executeStatement(
      activeConnection.value as DynamoDBConnection,
      { statement, nextToken: currentNextToken.value },
    );

    if (queryResult.value) {
      queryResult.value = {
        items: [...queryResult.value.items, ...result.items],
        count: queryResult.value.count + result.count,
        next_token: result.next_token,
      };
    } else {
      queryResult.value = result;
    }
    currentNextToken.value = result.next_token;
  } catch (err) {
    const error = err as CustomError;
    message.error(`Error: ${error.details || error.message}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  } finally {
    loadingRef.value = false;
  }
};

// Save content to file
const saveModelContent = async (
  validateFile: boolean,
  displayError: boolean,
  displaySuccess: boolean,
) => {
  const model = editor?.getModel();
  if (!model) return;

  try {
    await saveContent(undefined, model.getValue() || '', validateFile);
    if (displaySuccess) {
      message.success(lang.t('dialogOps.fileSaveSuccess'), { duration: 1000 });
    }
  } catch (err) {
    if (displayError) {
      message.error((err as CustomError).details, {
        closable: true,
        keepAliveOnHover: true,
      });
    }
  }
};

// Setup Monaco editor
const setupEditor = () => {
  if (!editorRef.value) return;

  editor = monaco.editor.create(editorRef.value, {
    theme: getEditorTheme(),
    value: activePanel.value.content ?? '',
    language: 'partiql',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    lineNumbers: 'on',
    wordWrap: 'on',
    fontSize: 14,
    tabSize: 2,
  });

  if (!editor) return;

  editor.onDidChangeModelContent(() => {
    saveModelContent(false, false, false);
  });

  // Comment/uncomment line or block (Ctrl+/ or Cmd+/)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
    editor!.trigger('keyboard', 'editor.action.commentLine', {});
  });

  // Auto indent (Ctrl+I or Cmd+I)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
    editor!.trigger('keyboard', 'editor.action.formatDocument', {});
  });

  // Trigger autocomplete (Ctrl+Space or Cmd+Space)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
    editor!.trigger('keyboard', 'editor.action.triggerSuggest', {});
  });

  // Submit/execute query (Ctrl+Enter or Cmd+Enter)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    executeQuery();
  });

  // Collapse/expand current scope (Ctrl+Alt+L or Cmd+Alt+L)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL, () => {
    editor!.trigger('keyboard', 'editor.toggleFold', {});
  });

  // Collapse all scopes but the current one (Ctrl+Alt+0 or Cmd+Alt+0)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Digit0, () => {
    editor!.trigger('keyboard', 'editor.foldAll', {});
    editor!.trigger('keyboard', 'editor.unfoldRecursively', {});
  });

  // Save file (Ctrl+S or Cmd+S on Windows)
  if (platform() === 'windows') {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveModelContent(true, true, true);
    });
  }

  // Update dynamic options for autocomplete
  if (activeConnection.value) {
    const con = activeConnection.value as DynamoDBConnection;
    setPartiqlDynamicOptions({
      tableNames: [con.tableName],
      activeTable: con.tableName,
      attributeKeys: con.attributeDefinitions?.map(attr => attr.attributeName) || [],
    });
  }
};

// Watch for theme changes
watch(themeType, () => {
  const vsTheme = getEditorTheme();
  editor?.updateOptions({ theme: vsTheme });
});

// Watch for connection changes to update autocomplete options
watch(activeConnection, newConnection => {
  if (newConnection) {
    const con = newConnection as DynamoDBConnection;
    setPartiqlDynamicOptions({
      tableNames: [con.tableName],
      activeTable: con.tableName,
      attributeKeys: con.attributeDefinitions?.map(attr => attr.attributeName) || [],
    });
  }
});

// File save listener
const saveFileListener = ref<Function>();

const setupFileListener = async () => {
  saveFileListener.value = await listen('saveFile', async () => {
    await saveModelContent(true, true, true);
  });
};

const cleanupFileListener = async () => {
  if (saveFileListener.value) {
    await saveFileListener.value();
  }
};

onMounted(async () => {
  setupEditor();
  await setupFileListener();
});

onUnmounted(async () => {
  await cleanupFileListener();
  editor?.dispose();
});
</script>

<style lang="scss" scoped>
.partiql-editor {
  width: 100%;
  height: 100%;

  .editor-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .editor-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      background-color: var(--card-color);
    }

    .monaco-editor-container {
      flex: 1;
      width: 100%;
      height: 0;
    }
  }

  .result-container {
    width: 100%;
    height: 100%;
    border-left: 1px solid var(--border-color);
    overflow: auto;

    .error-card {
      margin: 12px;
    }

    .result-card {
      margin: 12px;
      height: calc(100% - 24px);

      .table-container {
        height: calc(100% - 60px);
        overflow: auto;
      }
    }

    .empty-state {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
}
</style>
