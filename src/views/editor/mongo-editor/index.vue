<template>
  <SplitPane v-model:size="queryEditorSize" direction="horizontal" class="editor">
    <template #1>
      <div class="query-editor-container">
        <div id="mongo-query-editor" ref="queryEditorRef" />
      </div>
    </template>
    <template #2>
      <DisplayEditor id="mongo-display-editor" ref="displayRef" />
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
import DisplayEditor from '../es-editor/display-editor.vue';
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
const displayRef = ref<InstanceType<typeof DisplayEditor>>();
let queryEditor: Editor | null = null;
let cleanupFileListener: (() => void) | null = null;

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
      showDisplayEditor(saved);
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
  }
});

const showDisplayEditor = (content: unknown, format?: string) => {
  queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
  displayRef.value?.display(content, format);
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
    showDisplayEditor('');
    loadingBar.start();

    const result = await mongoApi.executeQuery(activeConnection.value, code);

    if (!result.success) {
      throw new Error(result.error || 'Query execution failed');
    }

    historyStore.addEntry({
      databaseType: DatabaseType.MONGODB,
      method: 'MONGO',
      path: '',
      qdsl: code,
      connectionName: activeConnection.value.name,
      connectionId: activeConnection.value.id,
    });

    showDisplayEditor(result.data);
    saveQueryResult(result.data);
    loadingBar.finish();
  } catch (_err) {
    loadingBar.error();
    const errorMessage = _err instanceof Error ? _err.message : String(_err);
    message.error(`${lang.t('editor.mongo.error')}: ${errorMessage}`, {
      closable: true,
      keepAliveOnHover: true,
    });
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
  displayRef?.value?.dispose();
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

.editor #mongo-display-editor {
  width: 100%;
  height: 100%;
  border-left: 1px solid hsl(var(--border));
}
</style>
