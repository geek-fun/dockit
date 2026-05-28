<template>
  <SplitPane v-model:size="queryEditorSize" direction="horizontal" class="editor">
    <template #1>
      <div class="query-editor-container">
        <div id="mongo-query-editor" ref="queryEditorRef" />
      </div>
    </template>
    <template #2>
      <ResultPanel
        v-if="resultPanelVisible"
        :documents="resultDocuments"
        :total="resultTotal"
        :query-time="resultQueryTime"
        :collection="resultCollection"
        :error-message="resultError"
        :has-data="resultHasData"
        :executed="resultExecuted"
        :loading="resultLoading"
        class="result-panel-area"
        @close="handleResultClose"
        @refresh="executeCurrentStatement"
      />
    </template>
  </SplitPane>
</template>

<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { SplitPane } from '@/components/ui/split-pane';
import { useMessageService, useLoadingBarService } from '@/composables';
import {
  DatabaseType,
  MongoDBConnection,
  useAppStore,
  useCodeActionStore,
  useConnectionStore,
  useHistoryStore,
  useTabStore,
} from '../../../store';
import { useLang } from '../../../lang';
import ResultPanel from './components/result-panel.vue';
import {
  Editor,
  monaco,
  mongoSampleQueries,
  setMongoDynamicOptions,
  validateMongoModel,
  clearMongoValidation,
  clearMongoDynamicOptions,
  createDebouncedValidator,
} from '../../../common/monaco';
import { mongoApi } from '../../../datasources';

const appStore = useAppStore();
const codeActionStore = useCodeActionStore();
const message = useMessageService();
const loadingBar = useLoadingBarService();
const lang = useLang();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);
const { insertBuffer } = storeToRefs(codeActionStore);

const tabStore = useTabStore();
const { activePanel } = storeToRefs(tabStore);
const { saveContent, saveQueryResult } = tabStore;

const connectionStore = useConnectionStore();
const { fetchCollections } = connectionStore;

const historyStore = useHistoryStore();

const activeConnection = computed(
  () => activePanel.value.connection as MongoDBConnection | undefined,
);

const queryEditorRef = ref();
let queryEditor: Editor | null = null;
let cleanupFileListener: (() => void) | null = null;

// Result panel state
const resultPanelVisible = ref(false);
const resultDocuments = ref<Record<string, unknown>[]>([]);
const resultTotal = ref<number | undefined>(undefined);
const resultQueryTime = ref<number | undefined>(undefined);
const resultCollection = ref<string | undefined>(undefined);
const resultError = ref<string | null>(null);
const resultHasData = ref(false);
const resultExecuted = ref(false);
const resultLoading = ref(false);

const debouncedValidate = createDebouncedValidator((model: monaco.editor.ITextModel) => {
  validateMongoModel(model);
}, 300);

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  queryEditor?.updateOptions({ theme: vsTheme });
});

watch(
  editorConfig,
  () => {
    const options = getEditorOptions();
    queryEditor?.updateOptions(options);
    queryEditor?.getModel()?.updateOptions({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  },
  { deep: true },
);

watch(
  () => activePanel.value.id,
  () => {
    const saved = activePanel.value.queryResult;
    if (saved !== undefined) {
      showResultPanel(saved as unknown);
    }
  },
);

watch(insertBuffer, () => {
  if (queryEditor) {
    const position = queryEditor.getPosition();
    if (!position) return;
    queryEditor.getModel()?.pushEditOperations(
      [],
      [
        {
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column,
          ),
          text: insertBuffer.value,
        },
      ],
      () => null,
    );
    codeActionStore.clearInsertBuffer();
  }
});

const showResultPanel = (
  content: unknown,
  error?: string,
  queryTime?: number,
  collection?: string,
) => {
  queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
  resultPanelVisible.value = true;
  resultExecuted.value = true;
  resultError.value = error ?? null;
  resultQueryTime.value = queryTime;
  resultCollection.value = collection;

  if (error) {
    resultDocuments.value = [];
    resultTotal.value = undefined;
    resultHasData.value = false;
    return;
  }

  if (Array.isArray(content)) {
    resultDocuments.value = content as Record<string, unknown>[];
    resultTotal.value = (content as Record<string, unknown>[]).length;
    resultHasData.value = true;
  } else if (content !== null && content !== undefined && content !== '') {
    resultDocuments.value = [{ result: content }];
    resultTotal.value = 1;
    resultHasData.value = true;
  } else {
    resultDocuments.value = [];
    resultTotal.value = 0;
    resultHasData.value = false;
  }
};

const handleResultClose = () => {
  resultPanelVisible.value = false;
  queryEditorSize.value = 1;
};

const executeCurrentStatement = async () => {
  const model = queryEditor?.getModel();
  if (!model || !activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  const selection = queryEditor?.getSelection();
  let code: string;
  if (selection && !selection.isEmpty()) {
    code = model.getValueInRange(selection);
  } else {
    code = model.getValue();
  }

  if (!code.trim()) {
    message.warning(lang.t('editor.mongo.emptyStatement'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  try {
    resultLoading.value = true;
    resultPanelVisible.value = true;
    queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
    loadingBar.start();

    const startTime = Date.now();
    const result = await mongoApi.executeQuery(activeConnection.value, code);
    const queryTime = Date.now() - startTime;

    if (!result.success) {
      throw new Error(result.error || 'Query execution failed');
    }

    const collectionFromQuery = [...code.trim().matchAll(/^db\.([^.\s(]+)\./gm)].pop()?.[1];
    const collection = collectionFromQuery ?? activePanel.value.activeTable ?? undefined;
    const operationFromQuery = code.match(/db\.\w+\.\s*(\w+)\s*\(/)?.[1];
    const databaseFromConnection =
      activeConnection.value.activeDatabase || activeConnection.value.database;
    const resultCount = Array.isArray(result.data) ? result.data.length : undefined;

    historyStore.addEntry({
      databaseType: DatabaseType.MONGODB,
      method: 'MONGO',
      path: '',
      qdsl: code,
      connectionName: activeConnection.value.name,
      connectionId: activeConnection.value.id,
      mongoOperation: operationFromQuery,
      mongoCollection: collectionFromQuery,
      mongoDatabase: databaseFromConnection,
      mongoDuration: queryTime,
      mongoResultCount: resultCount,
    });

    showResultPanel(result.data, undefined, queryTime, collection);
    saveQueryResult(result.data);
    loadingBar.finish();
  } catch (_err) {
    loadingBar.error();
    const errorMessage = _err instanceof Error ? _err.message : String(_err);
    showResultPanel(null, errorMessage);
    message.error(`${lang.t('editor.mongo.error')}: ${errorMessage}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  } finally {
    resultLoading.value = false;
  }
};

const insertSampleQuery = (queryTemplate: string) => {
  const model = queryEditor?.getModel();
  if (!model) return;

  const selectedCollection = activePanel.value.activeTable;
  let query = queryTemplate;
  if (selectedCollection) {
    query = queryTemplate.replace(/\bcollection\b/g, selectedCollection);
  }

  const position = queryEditor?.getPosition();
  if (!position) return;

  const currentLineLength = model.getLineLength(position.lineNumber);
  const insertText = currentLineLength > 0 ? '\n\n' + query : query;

  model.pushEditOperations(
    [],
    [
      {
        range: new monaco.Range(
          position.lineNumber,
          currentLineLength + 1,
          position.lineNumber,
          currentLineLength + 1,
        ),
        text: insertText,
      },
    ],
    () => null,
  );

  const newLineNumber = position.lineNumber + (currentLineLength > 0 ? 2 : 0);
  queryEditor?.setPosition({ lineNumber: newLineNumber, column: 1 });
  queryEditor?.revealLine(newLineNumber);
};

const setupQueryEditor = () => {
  const editorOptions = getEditorOptions();
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    theme: getEditorTheme(),
    value: activePanel.value.content || mongoSampleQueries.findAll,
    language: 'mongodb',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordBasedSuggestions: 'off',
    ...editorOptions,
  });

  if (!queryEditor) return;

  queryEditor.onDidChangeModelContent(() => {
    saveContent(undefined, queryEditor?.getModel()?.getValue() || '', false);
    const model = queryEditor?.getModel();
    if (model) {
      debouncedValidate(model);
    }
  });

  const model = queryEditor.getModel();
  if (model) {
    validateMongoModel(model);
  }

  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    executeCurrentStatement();
  });

  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    saveContent(undefined, queryEditor?.getModel()?.getValue() || '', true);
  });
};

const queryEditorSize = ref(1);

const setupFileListener = async () => {
  cleanupFileListener = await listen('saveFile', () => {
    saveContent(undefined, queryEditor?.getModel()?.getValue() || '', true);
  });
};

const updateDynamicOptions = () => {
  const conn = activeConnection.value;
  const model = queryEditor?.getModel();
  if (conn && conn.type === DatabaseType.MONGODB && model) {
    setMongoDynamicOptions(model.uri.toString(), {
      collectionNames: conn.collections?.map(c => c.name) ?? [],
      activeCollection: activePanel.value.activeTable,
    });
  }
};

onMounted(async () => {
  setupQueryEditor();
  await setupFileListener();
  updateDynamicOptions();

  if (activeConnection.value) {
    try {
      await fetchCollections(activeConnection.value);
      updateDynamicOptions();
    } catch (_err) {
      message.error(lang.t('connection.errorFetchCollections'));
    }
  }
});

onUnmounted(() => {
  cleanupFileListener?.();
  const model = queryEditor?.getModel();
  if (model) {
    clearMongoValidation(model);
    clearMongoDynamicOptions(model.uri.toString());
  }
  queryEditor?.dispose();
});

defineExpose({
  insertSampleQuery,
  executeCurrentStatement,
});
</script>

<style scoped>
.editor {
  width: 100%;
  height: 100%;
}

.editor .query-editor-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.editor .query-editor-container #mongo-query-editor {
  width: 100%;
  height: 100%;
}

.result-panel-area {
  width: 100%;
  height: 100%;
  border-left: 1px solid hsl(var(--border));
}
</style>
