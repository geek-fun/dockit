<template>
  <SplitPane v-model:size="queryEditorSize" direction="horizontal" class="editor">
    <template #1>
      <div class="query-editor-container">
        <div id="mongo-query-editor" ref="queryEditorRef" />
        <!-- Context menu for gutter actions -->
        <div
          v-if="contextMenuVisible"
          class="mongo-context-menu"
          :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
          @click.stop
        >
          <ul ref="contextMenuRef" role="menu" @keydown="handleMenuKeydown">
            <li
              v-for="(item, index) in menuItems"
              :key="item.action"
              role="menuitem"
              tabindex="-1"
              :class="['menu-item', index === highlightedIndex && 'bg-accent']"
              @click="handleContextMenuAction(item.action as any)"
              @keydown.enter.prevent="handleContextMenuAction(item.action as any)"
              @keydown.space.prevent="handleContextMenuAction(item.action as any)"
            >
              <span>{{ item.label }}</span>
              <span v-if="item.shortcut" class="shortcut">{{ item.shortcut }}</span>
            </li>
          </ul>
        </div>
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
import { platform } from '@tauri-apps/plugin-os';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { SplitPane } from '@/components/ui/split-pane';
import { useMessageService, useLoadingBarService, useEditorInsertCode } from '@/composables';
import { jsonify } from '../../../common';
import {
  DatabaseType,
  MongoDBConnection,
  useAppStore,
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
  parseMongoStatements,
  getMongoStatementAtLine,
  getMongoStatementDecorations,
  mongoExecutionGutterClass,
} from '../../../common/monaco';
import type { MongoStatement, MongoDecoration } from '../../../common/monaco/mongodb/parser';
import { mongoApi } from '../../../datasources';

const appStore = useAppStore();
const message = useMessageService();
const loadingBar = useLoadingBarService();
const lang = useLang();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

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

useEditorInsertCode(() => queryEditor);

// Gutter decorations state
let executeDecorations: Array<MongoDecoration | string> = [];
let mongoStatements: MongoStatement[] = [];

// Monaco editor target type for gutter line decorations
// See: https://microsoft.github.io/monaco-editor/api/enums/editor.MouseTargetType.html
const MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS = 4;

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuActionLine = ref<number | null>(null);
const cmdKey = computed(() => (platform() === 'macos' ? '⌘' : 'Ctrl+'));

const contextMenuRef = ref<HTMLElement | null>(null);
const highlightedIndex = ref(0);

const menuItems = computed(() => [
  {
    action: 'execute',
    label: lang.t('editor.mongo.contextMenu.execute'),
    shortcut: `${cmdKey.value}↵`,
  },
  {
    action: 'copy',
    label: lang.t('editor.mongo.contextMenu.copy'),
  },
]);

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

const handleMenuKeydown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % menuItems.value.length;
    focusMenuItem(highlightedIndex.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value =
      (highlightedIndex.value - 1 + menuItems.value.length) % menuItems.value.length;
    focusMenuItem(highlightedIndex.value);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideContextMenu();
  }
};

const focusMenuItem = (index: number) => {
  nextTick(() => {
    if (contextMenuRef.value) {
      const items = contextMenuRef.value.querySelectorAll('li');
      if (items[index]) {
        (items[index] as HTMLElement).focus();
      }
    }
  });
};

watch(contextMenuVisible, visible => {
  if (visible) {
    highlightedIndex.value = 0;
    focusMenuItem(0);
  }
});

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
    // For plain objects (e.g., write acknowledgments like insertOne result),
    // spread the keys as columns so they display properly in table view.
    // For scalar values, wrap under a "result" column.
    if (typeof content === 'object' && !Array.isArray(content)) {
      resultDocuments.value = [content as Record<string, unknown>];
    } else {
      resultDocuments.value = [{ result: content }];
    }
    resultTotal.value = 1;
    resultHasData.value = true;
  } else {
    resultDocuments.value = [];
    resultTotal.value = 0;
    resultHasData.value = false;
  }
};

/**
 * Refresh gutter decorations for MongoDB statements
 */
const refreshStatementDecorations = () => {
  if (!queryEditor) return;

  const model = queryEditor.getModel();
  if (!model) return;

  const content = model.getValue();
  mongoStatements = parseMongoStatements(content);
  const freshDecorations = getMongoStatementDecorations(mongoStatements);

  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = queryEditor.deltaDecorations(
    executeDecorations as Array<string>,
    freshDecorations,
  ) as unknown as MongoDecoration[];
};

/**
 * Execute a MongoDB statement at a specific line
 */
const executeStatementAtLine = async (lineNumber: number) => {
  if (!queryEditor || !activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  const stmt = getMongoStatementAtLine(mongoStatements, lineNumber);
  if (!stmt) {
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
    const result = await mongoApi.executeQuery(activeConnection.value, stmt.statement);
    const queryTime = Date.now() - startTime;

    if (result.error) {
      throw new Error(result.error || 'Query execution failed');
    }

    const collectionFromQuery = [...stmt.statement.matchAll(/^db\.([^.\s(]+)\./gm)].pop()?.[1];
    const collection = collectionFromQuery ?? activePanel.value.activeTable ?? undefined;
    const operationFromQuery = stmt.statement.match(/db\.\w+\.\s*(\w+)\s*\(/)?.[1];
    const databaseFromConnection =
      activeConnection.value.activeDatabase || activeConnection.value.database;
    const resultCount = Array.isArray(result.data) ? result.data.length : undefined;

    historyStore.addEntry({
      databaseType: DatabaseType.MONGODB,
      method: 'MONGO',
      path: '',
      qdsl: stmt.statement,
      connectionName: activeConnection.value.name,
      connectionId: activeConnection.value.id!,
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

/**
 * Copy a MongoDB statement at a specific line to clipboard
 */
const copyStatementAtLine = async (lineNumber: number) => {
  const stmt = getMongoStatementAtLine(mongoStatements, lineNumber);
  if (!stmt) {
    message.warning(lang.t('editor.mongo.emptyStatement'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard API not supported');
    }
    await navigator.clipboard.writeText(stmt.statement);
    message.success(lang.t('editor.copySuccess'));
  } catch (err) {
    message.error(`${lang.t('editor.copyFailure')}: ${jsonify.stringify(err)}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

/**
 * Hide context menu
 */
const hideContextMenu = () => {
  contextMenuVisible.value = false;
  contextMenuActionLine.value = null;
};

/**
 * Handle context menu action
 */
const handleContextMenuAction = (action: 'execute' | 'copy') => {
  const lineNumber = contextMenuActionLine.value;
  hideContextMenu();

  if (lineNumber === null) return;

  const stmt = getMongoStatementAtLine(mongoStatements, lineNumber);
  if (!stmt) return;

  if (action === 'execute') {
    executeStatementAtLine(lineNumber);
  } else if (action === 'copy') {
    copyStatementAtLine(lineNumber);
  }
};

/**
 * Handle click outside context menu to close it
 */
const handleDocumentClick = (event: MouseEvent) => {
  if (contextMenuVisible.value) {
    const target = event.target as HTMLElement;
    if (!target.closest('.mongo-context-menu')) {
      hideContextMenu();
    }
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
    // Find the statement at cursor position (same behavior as gutter click)
    const position = queryEditor?.getPosition();
    if (!position) {
      message.warning(lang.t('editor.mongo.emptyStatement'), {
        closable: true,
        keepAliveOnHover: true,
      });
      return;
    }
    const stmt = getMongoStatementAtLine(mongoStatements, position.lineNumber);
    if (!stmt) {
      message.warning(lang.t('editor.mongo.emptyStatement'), {
        closable: true,
        keepAliveOnHover: true,
      });
      return;
    }
    code = stmt.statement;
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

    if (result.error) {
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
      connectionId: activeConnection.value.id!,
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
    // Update gutter decorations when content changes
    refreshStatementDecorations();
    const model = queryEditor?.getModel();
    if (model) {
      debouncedValidate(model);
    }
  });

  // Initial decoration refresh
  refreshStatementDecorations();

  const model = queryEditor.getModel();
  if (model) {
    validateMongoModel(model);
  }

  // Handle left-click on gutter execute button
  queryEditor.onMouseDown(({ event, target }) => {
    // Hide context menu on any click
    hideContextMenu();

    if (
      event.leftButton &&
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(mongoExecutionGutterClass)
    ) {
      executeStatementAtLine(target.position.lineNumber);
    }
  });

  // Handle right-click on gutter execute button for context menu
  queryEditor.onContextMenu(({ event, target }) => {
    if (
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(mongoExecutionGutterClass)
    ) {
      event.preventDefault();
      event.stopPropagation();

      // Position context menu near the click
      contextMenuPosition.value = {
        x: event.posx,
        y: event.posy,
      };
      contextMenuActionLine.value = target.position.lineNumber;
      contextMenuVisible.value = true;
    }
  });

  // Keyboard shortcut for context menu (Shift+F10 or ContextMenu key)
  queryEditor.addAction({
    id: 'show-context-menu',
    label: lang.t('editor.showContextMenu'),
    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F10],
    run: ed => {
      const position = ed.getPosition();
      if (!position) return;

      const coords = ed.getScrolledVisiblePosition(position);
      const domNode = ed.getDomNode();
      if (coords && domNode) {
        const rect = domNode.getBoundingClientRect();
        contextMenuPosition.value = {
          x: rect.left + coords.left,
          y: rect.top + coords.top + 20, // offset slightly below cursor
        };
        contextMenuActionLine.value = position.lineNumber;
        contextMenuVisible.value = true;
      }
    },
  });

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
  // Add document click listener for context menu
  document.addEventListener('click', handleDocumentClick);

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
  // Remove document click listener
  document.removeEventListener('click', handleDocumentClick);
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

:deep(.mongo-execute-decoration) {
  cursor: pointer;
  width: 0;
  height: 0;
  margin-top: 0;
  margin-left: 4px;
  border-radius: 4px;
  border-style: solid;
  border-width: 10px 0 10px 12px;
  border-color: transparent transparent transparent hsl(var(--primary));
}

.mongo-context-menu {
  position: fixed;
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  border-radius: 4px;
  overflow: hidden;
}

.mongo-context-menu ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  min-width: 180px;
}

.mongo-context-menu ul li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}

.mongo-context-menu ul li .shortcut {
  font-size: 11px;
  opacity: 0.5;
  white-space: nowrap;
}

.mongo-context-menu ul li:hover {
  background: hsl(var(--accent));
}
</style>
