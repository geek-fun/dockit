<template>
  <SplitPane v-model:size="queryEditorSize" direction="horizontal" class="editor">
    <template #1>
      <div class="query-editor-container">
        <div id="query-editor" ref="queryEditorRef" />
        <!-- Context menu for gutter actions -->
        <div
          v-if="contextMenuVisible"
          class="es-context-menu"
          :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
          @click.stop
        >
          <ul>
            <li @click="handleContextMenuAction('execute')">
              {{ lang.t('editor.es.contextMenu.execute') }}
            </li>
            <li @click="handleContextMenuAction('autoIndent')">
              {{ lang.t('editor.es.contextMenu.autoIndent') }}
            </li>
            <li @click="handleContextMenuAction('copyAsCurl')">
              {{ lang.t('editor.es.contextMenu.copyAsCurl') }}
            </li>
          </ul>
        </div>
      </div>
    </template>
    <template #2>
      <DisplayEditor id="display-editor" ref="displayRef" />
    </template>
  </SplitPane>
</template>
<script setup lang="ts">
import { open } from '@tauri-apps/plugin-shell';
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { SplitPane } from '@/components/ui/split-pane';
import { useMessageService, useLoadingBarService } from '@/composables';
import { CustomError, jsonify } from '../../../common';
import {
  DatabaseType,
  ElasticsearchConnection,
  useAppStore,
  useChatStore,
  useConnectionStore,
  useHistoryStore,
  useTabStore,
} from '../../../store';
import { useLang } from '../../../lang';
import DisplayEditor from './display-editor.vue';
import {
  buildSearchToken,
  Decoration,
  Editor,
  EngineType,
  executionGutterClass,
  formatQDSL,
  getAction,
  getActionApiDoc,
  getActionMarksDecorations,
  monaco,
  SearchAction,
  searchTokens,
  transformQDSL,
  validateEsModel,
  clearEsValidation,
  createDebouncedValidator,
} from '../../../common/monaco';

const appStore = useAppStore();
const message = useMessageService();
const loadingBar = useLoadingBarService();
const lang = useLang();

const tabStore = useTabStore();
const { saveContent } = tabStore;
const { activePanel, defaultSnippet, activeConnection, activeElasticsearchIndexOption } =
  storeToRefs(tabStore);

const connectionStore = useConnectionStore();
const { searchQDSL, queryToCurl, fetchIndices } = connectionStore;
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

const historyStore = useHistoryStore();

const chatStore = useChatStore();
const { insertBoard } = storeToRefs(chatStore);
// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let queryEditor: Editor | null = null;
// DOM
const queryEditorRef = ref();
const displayRef = ref();

let executeDecorations: Array<Decoration | string> = [];

// Monaco editor target type for gutter line decorations
// See: https://microsoft.github.io/monaco-editor/api/enums/editor.MouseTargetType.html
const MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS = 4;

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuActionLine = ref<number | null>(null);

// Debounced syntax validation (300ms delay for performance)
const debouncedValidate = createDebouncedValidator((model: monaco.editor.ITextModel) => {
  validateEsModel(model);
}, 300);

const refreshActionMarks = (editor: Editor, searchTokens: SearchAction[]) => {
  const freshDecorations = getActionMarksDecorations(searchTokens);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshDecorations,
  ) as unknown as Decoration[];
};

/**
 * Refresh search tokens and decorations
 */
const refreshSearchTokensAndDecorations = () => {
  if (!queryEditor) return;
  const model = queryEditor.getModel();
  if (!model) return;

  buildSearchToken(model);
  refreshActionMarks(queryEditor, searchTokens);
};

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  queryEditor?.updateOptions({ theme: vsTheme });
});

watch(
  editorConfig,
  () => {
    queryEditor?.updateOptions(getEditorOptions());
  },
  { deep: true },
);

watch(insertBoard, () => {
  if (queryEditor) {
    // add event to handle chatbot-code-actions
    const position = queryEditor.getPosition();
    if (!position) {
      return;
    }
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
          text: insertBoard.value,
        },
      ],
      () => null,
    );
  }
});

const executeQueryAction = async (position: { column: number; lineNumber: number }) => {
  const action = searchTokens.find(
    ({ position: actionPosition }) => actionPosition.startLineNumber === position.lineNumber,
  );

  if (!action) {
    return;
  }

  try {
    showDisplayEditor('');
    if (!activeConnection.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
      });
      return;
    }

    loadingBar.start();
    const data = await searchQDSL(activeConnection.value, {
      ...action,
      queryParams: action.queryParams ?? undefined,
      qdsl: transformQDSL(action),
      index: action.index,
    });

    historyStore.addEntry({
      databaseType: DatabaseType.ELASTICSEARCH,
      method: action.method,
      path: action.path,
      index: action.index,
      qdsl: transformQDSL(action),
      connectionName: activeConnection.value.name,
      connectionId: activeConnection.value.id,
    });

    showDisplayEditor(data);
    loadingBar.finish();
  } catch (err) {
    loadingBar.error();
    const { status, details } = err as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

const autoIndentAction = (editor: monaco.editor.IStandaloneCodeEditor, position: monaco.Range) => {
  const model = editor?.getModel();
  const action = getAction(position);

  if (!action || !model) {
    return;
  }
  const { startLineNumber, endLineNumber } = action.position;

  try {
    const formatted = formatQDSL(searchTokens, model, action.position);
    model.pushEditOperations(
      [],
      [
        {
          range: {
            startLineNumber: startLineNumber + 1,
            startColumn: 1,
            endLineNumber,
            endColumn: model.getLineLength(endLineNumber) + 1,
          },
          text: formatted,
        },
      ],
      // @ts-ignore
      _inverseEditOperations => [],
    );
    editor.setPosition({ lineNumber: startLineNumber + 1, column: 1 });
  } catch (_err) {
    message.error(lang.t('editor.invalidJson'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }
};

const copyCurlAction = (position: monaco.Range) => {
  const action = getAction(position);
  if (!action) {
    return;
  }
  try {
    navigator.clipboard.writeText(
      queryToCurl(activeConnection.value as ElasticsearchConnection, action),
    );
    message.success(lang.t('editor.copySuccess'));
  } catch (err) {
    message.error(`${lang.t('editor.copyFailed')}: ${jsonify.stringify(err)}`, {
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
const handleContextMenuAction = (action: 'execute' | 'autoIndent' | 'copyAsCurl') => {
  const lineNumber = contextMenuActionLine.value;
  hideContextMenu();

  if (lineNumber === null) return;

  const searchAction = searchTokens.find(({ position }) => position.startLineNumber === lineNumber);

  if (!searchAction) return;

  if (action === 'execute') {
    executeQueryAction({ column: 1, lineNumber });
  } else if (action === 'autoIndent') {
    autoIndentAction(queryEditor!, searchAction.position);
  } else if (action === 'copyAsCurl') {
    copyCurlAction(searchAction.position);
  }
};

/**
 * Handle click outside context menu to close it
 */
const handleDocumentClick = (event: MouseEvent) => {
  if (contextMenuVisible.value) {
    const target = event.target as HTMLElement;
    if (!target.closest('.es-context-menu')) {
      hideContextMenu();
    }
  }
};

const setupQueryEditor = () => {
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    theme: getEditorTheme(),
    value: activePanel.value.content ?? '',
    language: 'search',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    ...getEditorOptions(),
  });
  if (!queryEditor) {
    return;
  }
  queryEditor.getModel()?.updateOptions({ tabSize: 2 });

  queryEditor.onDidChangeModelContent(_changes => {
    saveModelContent(false, false, false);
    // Update gutter decorations when content changes
    refreshSearchTokensAndDecorations();
    // Trigger debounced syntax validation
    const model = queryEditor?.getModel();
    if (model) {
      debouncedValidate(model);
    }
  });

  // Initial decoration refresh
  refreshSearchTokensAndDecorations();

  // Initial syntax validation
  const model = queryEditor.getModel();
  if (model) {
    validateEsModel(model);
  }

  // Handle left-click on gutter execute button
  queryEditor.onMouseDown(({ event, target }) => {
    // Hide context menu on any click
    hideContextMenu();

    if (
      event.leftButton &&
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(executionGutterClass)
    ) {
      executeQueryAction(target.position);
    }
  });

  // Handle right-click on gutter execute button for context menu
  queryEditor.onContextMenu(({ event, target }) => {
    if (
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(executionGutterClass)
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

  // comments/uncomment line or block
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
    queryEditor!.trigger('keyboard', 'editor.action.commentLine', {});
  });

  // Auto indent current request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
    const { position } = getAction(queryEditor!.getPosition()) || {};
    if (position) {
      autoIndentAction(queryEditor!, position);
    }
  });

  // Toggle Autocomplete
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
    queryEditor!.trigger('keyboard', 'editor.action.triggerSuggest', {});
  });

  // Submit request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    const { position } = getAction(queryEditor!.getPosition()) ?? {};
    if (position) {
      executeQueryAction({ column: position.startColumn, lineNumber: position.startLineNumber });
    }
  });

  // Jump to the previous request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow, () => {
    const position = queryEditor?.getPosition();
    if (!position) {
      return;
    }
    const action = searchTokens
      .filter(({ position }) => position)
      .sort((a, b) => b.position.startLineNumber - a.position.startLineNumber)
      .find(({ position: { startLineNumber } }) => startLineNumber < position.lineNumber);

    if (action) {
      queryEditor!.revealLine(action.position.startLineNumber);
      queryEditor!.setPosition({
        column: position.column,
        lineNumber: action.position.startLineNumber,
      });
    }
  });

  // Jump to the next request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, () => {
    const position = queryEditor?.getPosition();
    if (!position) {
      return;
    }
    const action = searchTokens
      .filter(({ position }) => position)
      .sort((a, b) => a.position.startLineNumber - b.position.startLineNumber)
      .find(({ position: { startLineNumber } }) => startLineNumber > position.lineNumber);

    if (action) {
      queryEditor!.revealLine(action.position.startLineNumber);
      queryEditor!.setPosition({
        column: position.column,
        lineNumber: action.position.startLineNumber,
      });
    }
  });

  // Collapse/expand current scope
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL, () => {
    queryEditor!.trigger('keyboard', 'editor.toggleFold', {});
  });

  // Collapse all scopes but the current one
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Digit0, () => {
    queryEditor!.trigger('keyboard', 'editor.foldAll', {});
    queryEditor!.trigger('keyboard', 'editor.unfoldRecursively', {});
  });

  // Open the documentation for the current action
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
    const docLink = getActionApiDoc(
      EngineType.ELASTICSEARCH,
      'current',
      getAction(queryEditor?.getPosition()) as SearchAction,
    );
    if (docLink) {
      open(docLink);
    }
  });

  /**
   * Save the current file
   * @see https://github.com/tauri-apps/wry/issues/451
   */
  if (platform() === 'windows') {
    queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveModelContent(true, true, true);
    });
  }
};

const queryEditorSize = ref(1);

const showDisplayEditor = (content: unknown) => {
  queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
  displayRef.value.display(content);
};

const saveFileListener = ref<Function>();

const saveModelContent = async (
  validateFile: boolean,
  displayError: boolean,
  displaySuccess: boolean,
) => {
  const model = queryEditor?.getModel();
  if (!model) {
    return;
  }
  try {
    await saveContent(undefined, model.getValue() || '', validateFile);
    if (displaySuccess) {
      message.success(lang.t('dialogOps.fileSaveSuccess'), {
        duration: 1000,
      });
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

const setupFileListener = async () => {
  // listen for saveFile event
  saveFileListener.value = await listen('saveFile', async () => {
    await saveModelContent(true, true, true);
  });
};

watch(defaultSnippet, () => {
  queryEditor?.getModel()?.setValue(activePanel.value.content ?? '');
});

const cleanupFileListener = async () => {
  if (saveFileListener?.value) {
    await saveFileListener.value();
  }
};

const insertSampleQuery = (queryTemplate: string) => {
  if (!queryEditor) return;

  const model = queryEditor.getModel();
  if (!model) return;

  let query = queryTemplate;
  const selectedIndex = activeElasticsearchIndexOption.value?.[0]?.value;
  if (selectedIndex) {
    query = queryTemplate.replace(/\{index\}/g, selectedIndex);
  }

  const position = queryEditor.getPosition();
  if (!position) return;

  const currentLineLength = model.getLineLength(position.lineNumber);
  const insertText = '\n\n' + query;

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

  const newLineNumber = position.lineNumber + 2;
  queryEditor.setPosition({ lineNumber: newLineNumber, column: 1 });
  queryEditor.revealLine(newLineNumber);
};

defineExpose({
  insertSampleQuery,
});

onMounted(async () => {
  setupQueryEditor();
  await setupFileListener();
  // Add document click listener for context menu
  document.addEventListener('click', handleDocumentClick);

  // Fetch indices for active connection if available
  if (activeConnection.value) {
    try {
      await fetchIndices(activeConnection.value);
    } catch (_err) {
      // Silently fail
    }
  }
});

onUnmounted(async () => {
  await cleanupFileListener();
  // Remove document click listener
  document.removeEventListener('click', handleDocumentClick);
  // Clear validation markers before disposing
  const model = queryEditor?.getModel();
  if (model) {
    clearEsValidation(model);
  }
  queryEditor?.dispose();
  displayRef?.value?.dispose();
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

.editor .query-editor-container #query-editor {
  width: 100%;
  height: 100%;
}

.editor #display-editor {
  width: 100%;
  height: 100%;
  border-left: 1px solid hsl(var(--border));
}

.es-context-menu {
  position: fixed;
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  border-radius: 4px;
  overflow: hidden;
}

.es-context-menu ul {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  min-width: 140px;
}

.es-context-menu ul li {
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}

.es-context-menu ul li:hover {
  background: hsl(var(--accent));
}

:deep(.execute-button-decoration) {
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

:deep(.mtk14),
:deep(.mtk19) {
  color: #00756c;
}

:deep(.mtk22) {
  color: #c80a68;
}

:deep(.mtk11) {
  color: #cd3131;
  text-decoration: underline;
  text-decoration-style: wavy;
  text-decoration-color: #cd3131;
}
</style>
