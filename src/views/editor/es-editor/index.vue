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
      <DisplayEditor id="display-editor" ref="displayRef" />
    </template>
  </SplitPane>
</template>
<script setup lang="ts">
import { open } from '@tauri-apps/plugin-shell';
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import { storeToRefs } from 'pinia';
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue';
import { SplitPane } from '@/components/ui/split-pane';
import { useMessageService, useLoadingBarService } from '@/composables';
import { CustomError, jsonify } from '../../../common';
import {
  DatabaseType,
  ElasticsearchConnection,
  SearchConnection,
  useAppStore,
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
import { setupEditorKeyboardShortcuts, useEditorInsertCode } from '../../../composables';

const appStore = useAppStore();
const message = useMessageService();
const loadingBar = useLoadingBarService();
const lang = useLang();

const tabStore = useTabStore();
const { saveContent } = tabStore;
const { activePanel, defaultSnippet, activeConnection, activeSearchIndexOption } =
  storeToRefs(tabStore);

const connectionStore = useConnectionStore();
const { searchQDSL, queryToCurl, fetchIndices } = connectionStore;
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

const historyStore = useHistoryStore();

// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let queryEditor: Editor | null = null;
// DOM
const queryEditorRef = ref();
const displayRef = ref();

useEditorInsertCode(() => queryEditor);

let executeDecorations: Array<Decoration | string> = [];
let cleanupKeyboardShortcuts: (() => void) | null = null;

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
    label: lang.t('editor.es.contextMenu.execute'),
    shortcut: `${cmdKey.value}↵`,
  },
  {
    action: 'autoIndent',
    label: lang.t('editor.es.contextMenu.autoIndent'),
    shortcut: `${cmdKey.value}I`,
  },
  { action: 'copyAsCurl', label: lang.t('editor.es.contextMenu.copyAsCurl') },
]);

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
    const options = getEditorOptions();
    queryEditor?.updateOptions(options);
    queryEditor?.getModel()?.updateOptions({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  },
  { deep: true },
);

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
      databaseType: activeConnection.value.type,
      method: action.method,
      path: action.path,
      index: action.index,
      qdsl: transformQDSL(action),
      connectionName: activeConnection.value.name,
      connectionId: activeConnection.value.id,
    });

    const format = new URLSearchParams(action.queryParams ?? '').get('format') ?? undefined;
    showDisplayEditor(data, format);
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
  const editorOptions = getEditorOptions();
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    theme: getEditorTheme(),
    value: activePanel.value.content ?? '',
    language: 'search',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordBasedSuggestions: 'off',
    ...editorOptions,
  });
  if (!queryEditor) {
    return;
  }
  queryEditor.getModel()?.updateOptions({
    tabSize: editorOptions.tabSize,
    insertSpaces: editorOptions.insertSpaces,
  });

  queryEditor.onDidChangeModelContent(_changes => {
    saveModelContent(false, false, false);
    // Update gutter decorations when content changes
    refreshSearchTokensAndDecorations();
    // Trigger debounced syntax validation
    const model = queryEditor?.getModel();
    if (model) {
      debouncedValidate(model);
    }

    // Manually trigger suggestions for ES|QL commands, functions, and field names.
    // Monaco's triggerCharacters don't fire inside string tokens, so we use
    // requestAnimationFrame to trigger suggestions after the content change
    // is fully committed and the cursor position is updated.
    // We scan backwards from cursor to find the `query:` key — this handles
    // multi-line triple-quoted strings where `query:` is on a different line.
    if (_changes.changes.length > 0 && queryEditor) {
      const lastChange = _changes.changes[_changes.changes.length - 1];
      if (lastChange.text && /^[a-zA-Z]$/.test(lastChange.text)) {
        const pos = queryEditor.getPosition();
        if (pos) {
          const model = queryEditor.getModel();
          if (model) {
            let foundQueryKey = false;
            for (let lineNum = pos.lineNumber; lineNum >= 1; lineNum--) {
              const line = model.getLineContent(lineNum);
              if (line.includes('"query"') || line.includes('query:')) {
                foundQueryKey = true;
                break;
              }
            }
            if (foundQueryKey) {
              requestAnimationFrame(() => {
                queryEditor?.trigger('keyboard', 'editor.action.triggerSuggest', {});
              });
            }
          }
        }
      }
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

  // Toggle Fold: platform-specific (Ctrl+Shift+L on Windows/Linux, Cmd+Alt+L on macOS)
  // Ctrl+Shift+F/E are claimed by Sogou/Microsoft Pinyin IME on Windows, so use Ctrl+Shift+L.
  if (platform() === 'windows' || platform() === 'linux') {
    queryEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL,
      () => {
        queryEditor!.trigger('keyboard', 'editor.toggleFold', {});
      },
    );
  } else {
    queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL, () => {
      queryEditor!.trigger('keyboard', 'editor.toggleFold', {});
    });
  }

  // Fold All Except Current: Ctrl/Cmd+K, Ctrl/Cmd+0 (handled via DOM-level keydown)
  // Unfold All: Ctrl/Cmd+K, Ctrl/Cmd+J (also handled via DOM-level keydown to share chord state with fold-all)

  // Open ES API doc: ⌘+D on Mac, Ctrl+D on Windows/Linux
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => {
    const action = getAction(queryEditor!.getPosition());
    if (!action) return;
    const connection = activeConnection.value as SearchConnection | undefined;
    const version = connection?.version || 'current';
    const engineType =
      connection?.type === DatabaseType.OPENSEARCH || connection?.type === DatabaseType.EASYSEARCH
        ? EngineType.OPENSEARCH
        : EngineType.ELASTICSEARCH;
    const docLink = getActionApiDoc(engineType, version, action as SearchAction);
    if (docLink) open(docLink);
  });

  if (platform() === 'windows') {
    queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveModelContent(true, true, true);
    });
  }

  // Layout-dependent shortcuts (/) are handled via DOM keydown events
  // instead of Monaco's addCommand, which assumes US keyboard layout.
  // Chord shortcuts (Ctrl+K,Ctrl+0 / Ctrl+K,Ctrl+J) also use DOM events to share chord state.
  // See: src/composables/useKeyboardShortcuts.ts
  // Note: Ctrl/Cmd+Shift+/ (show shortcuts dialog) is handled globally at connect/index.vue

  // Keyboard shortcut for context menu (Shift+F10 or ContextMenu key)
  queryEditor.addAction({
    id: 'show-context-menu',
    label: 'Show Context Menu',
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

  cleanupKeyboardShortcuts = setupEditorKeyboardShortcuts(queryEditor, {
    shortcuts: [
      {
        key: '/',
        ctrlOrMeta: true,
        handler: () => queryEditor!.trigger('keyboard', 'editor.action.commentLine', {}),
      },
    ],
    chords: [
      {
        // Fold All Except Current: Ctrl/Cmd+K, Ctrl/Cmd+0
        // Uses '0' (like VS Code's Fold All) — works on all keyboard layouts
        // unlike '-' which requires Shift on AZERTY, or 'f' which conflicts
        // with Monaco's built-in Format Selection (Ctrl/Cmd+K, Ctrl/Cmd+F)
        first: { key: 'k', ctrlOrMeta: true },
        second: { key: '0', ctrlOrMeta: true },
        handler: () => {
          queryEditor!.trigger('keyboard', 'editor.foldAll', {});
          queryEditor!.trigger('keyboard', 'editor.unfoldRecursively', {});
        },
      },
      {
        first: { key: 'k', ctrlOrMeta: true },
        second: { key: 'j', ctrlOrMeta: true },
        handler: () => {
          queryEditor!.trigger('keyboard', 'editor.unfoldAll', {});
        },
      },
    ],
  });
};

const queryEditorSize = ref(1);

const showDisplayEditor = (content: unknown, format?: string) => {
  queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
  displayRef.value.display(content, format);
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
  const selectedIndex = activeSearchIndexOption.value?.[0]?.value;
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
  cleanupKeyboardShortcuts?.();
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
  min-width: 180px;
}

.es-context-menu ul li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}

.es-context-menu ul li .shortcut {
  font-size: 11px;
  opacity: 0.5;
  white-space: nowrap;
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
