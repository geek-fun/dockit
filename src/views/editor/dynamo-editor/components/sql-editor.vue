<template>
  <n-split direction="vertical" class="partiql-editor" v-model:size="editorSize">
    <template #1>
      <div class="editor-container">
        <div id="partiql-editor" ref="editorRef" class="monaco-editor-container" />
        <!-- Context menu for gutter actions -->
        <div
          v-if="contextMenuVisible"
          class="partiql-context-menu"
          :style="{ top: `${contextMenuPosition.y}px`, left: `${contextMenuPosition.x}px` }"
          @click.stop
        >
          <ul>
            <li @click="handleContextMenuAction('execute')">
              {{ lang.t('editor.dynamo.partiql.contextMenu.execute') }}
            </li>
            <li @click="handleContextMenuAction('copy')">
              {{ lang.t('editor.dynamo.partiql.contextMenu.copy') }}
            </li>
          </ul>
        </div>
      </div>
    </template>
    <template #2>
      <result-panel
        v-show="partiqlData.showResultPanel"
        :error-message="partiqlData.errorMessage"
        :has-data="partiqlData.data.length > 0"
        :columns="partiqlData.columns"
        :data="partiqlData.data"
        :item-count="partiqlData.count"
        :loading="loadingRef"
        :has-next-token="!!partiqlData.nextToken"
        :closable="true"
        :show-actions="true"
        :partition-key-name="partitionKeyName"
        :sort-key-name="sortKeyName"
        @load-more="loadMore"
        @close="handleCloseResultPanel"
        @edit="handleEdit"
        @delete="handleDelete"
      />
    </template>
  </n-split>

  <!-- Edit Item Modal -->
  <edit-item
    v-model:show="showEditModal"
    :item="editingItem"
    :partition-key-name="partitionKeyName"
    :partition-key-type="partitionKeyType"
    :sort-key-name="sortKeyName"
    :sort-key-type="sortKeyType"
    @submit="handleEditSubmit"
  />
</template>

<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { platform } from '@tauri-apps/plugin-os';
import { useMessage, useDialog } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { CustomError, jsonify } from '../../../../common';
import {
  clearPartiqlValidation,
  createDebouncedValidator,
  Editor,
  getPartiqlStatementDecorations,
  getStatementAtLine,
  monaco,
  parsePartiqlStatements,
  partiqlExecutionGutterClass,
  partiqlSampleQueries,
  setPartiqlDynamicOptions,
  validatePartiqlModel,
} from '../../../../common/monaco';
import type { PartiqlDecoration, PartiqlStatement } from '../../../../common/monaco/partiql';
import { useLang } from '../../../../lang';
import {
  DynamoDBConnection,
  useAppStore,
  useTabStore,
  useDbDataStore,
  useConnectionStore,
} from '../../../../store';
import ResultPanel from './result-panel.vue';
import EditItem from './edit-item.vue';

const lang = useLang();
const message = useMessage();
const dialog = useDialog();

const appStore = useAppStore();
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

const tabStore = useTabStore();
const { saveContent } = tabStore;
const { activePanel, activeConnection } = storeToRefs(tabStore);

const dbDataStore = useDbDataStore();
const { dynamoData } = storeToRefs(dbDataStore);
const partiqlData = computed(() => dynamoData.value.partiqlData);

let editor: Editor | null = null;
const editorRef = ref<HTMLElement>();
const editorSize = ref(partiqlData.value.showResultPanel ? 0.5 : 1);
const loadingRef = ref(false);

// Gutter decorations state
let executeDecorations: Array<PartiqlDecoration | string> = [];
let partiqlStatements: PartiqlStatement[] = [];

// Monaco editor target type for gutter line decorations
// See: https://microsoft.github.io/monaco-editor/api/enums/editor.MouseTargetType.html
const MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS = 4;

// Debounced syntax validation (300ms delay for performance)
const debouncedValidate = createDebouncedValidator((model: monaco.editor.ITextModel) => {
  validatePartiqlModel(model);
}, 300);

const contextMenuVisible = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuStatementLine = ref<number | null>(null);

const insertSampleQuery = (key: string) => {
  if (!editor) return;

  const query = partiqlSampleQueries[key as keyof typeof partiqlSampleQueries];
  if (!query) return;

  let queryText = query;
  if (activeConnection.value) {
    const con = activeConnection.value as DynamoDBConnection;
    queryText = query.replace(/"tablename"/g, `"${con.tableName}"`);
  }

  const model = editor.getModel();
  if (model) {
    const position = editor.getPosition();
    if (!position) return;

    const currentLineLength = model.getLineLength(position.lineNumber);
    const insertText = '\n\n' + queryText;

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
    editor.setPosition({ lineNumber: newLineNumber, column: 1 });
    editor.revealLine(newLineNumber);
  }
};

/**
 * Execute PartiQL statement with state management
 * Encapsulates the common logic for executing statements and managing state
 */
const executePartiqlStatement = async (statement: string, nextToken?: string | null) => {
  if (!activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  // Set editor size to show results panel
  if (!nextToken) {
    editorSize.value = 0.5;
  }

  loadingRef.value = true;

  try {
    await dbDataStore.executePartiqlStatement(
      activeConnection.value as DynamoDBConnection,
      statement,
      { nextToken },
    );
  } catch (err) {
    const error = err as CustomError;
    const errorMsg = error.details || error.message || String(err);
    message.error(`Error: ${errorMsg}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  } finally {
    loadingRef.value = false;
  }
};

/**
 * Refresh gutter decorations for PartiQL statements
 */
const refreshStatementDecorations = () => {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  const content = model.getValue();
  partiqlStatements = parsePartiqlStatements(content);
  const freshDecorations = getPartiqlStatementDecorations(partiqlStatements);

  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshDecorations,
  ) as unknown as PartiqlDecoration[];
};

/**
 * Execute a PartiQL statement at a specific line number
 */
const executeStatementAtLine = async (lineNumber: number) => {
  if (!editor || !activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  const statement = getStatementAtLine(partiqlStatements, lineNumber);
  if (!statement) {
    message.warning(lang.t('editor.dynamo.partiql.noStatementFound'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  await executePartiqlStatement(statement.statement);
};

/**
 * Copy a PartiQL statement at a specific line number to clipboard
 */
const copyStatementAtLine = async (lineNumber: number) => {
  const statement = getStatementAtLine(partiqlStatements, lineNumber);
  if (!statement) {
    message.warning(lang.t('editor.dynamo.partiql.noStatementFound'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  try {
    if (!navigator.clipboard) {
      throw new Error('Clipboard API not supported');
    }
    await navigator.clipboard.writeText(statement.statement);
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
  contextMenuStatementLine.value = null;
};

/**
 * Handle context menu action
 */
const handleContextMenuAction = (action: 'execute' | 'copy') => {
  const lineNumber = contextMenuStatementLine.value;
  hideContextMenu();

  if (lineNumber === null) return;

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
    if (!target.closest('.partiql-context-menu')) {
      hideContextMenu();
    }
  }
};

/**
 * Get the PartiQL statement to execute based on selection or cursor position
 * Returns the statement and whether it was found
 */
const getStatementToExecute = (): { statement: string; found: boolean } => {
  if (!editor) return { statement: '', found: false };

  const model = editor.getModel();
  if (!model) return { statement: '', found: false };

  const selection = editor.getSelection();

  // If user has selected text, use that
  if (selection && !selection.isEmpty()) {
    const selectedText = model.getValueInRange(selection).trim();
    if (selectedText) {
      return { statement: selectedText, found: true };
    }
  }

  // Otherwise, try to find the statement at cursor position
  const position = editor.getPosition();
  if (!position) return { statement: '', found: false };

  const fullText = model.getValue();
  const lines = fullText.split('\n');
  const currentLineIndex = position.lineNumber - 1;

  // Find statement boundaries by looking for semicolons or empty lines
  let startLine = currentLineIndex;
  let endLine = currentLineIndex;

  // Search backwards for statement start
  for (let i = currentLineIndex; i >= 0; i--) {
    const line = lines[i].trim();
    if (i < currentLineIndex && (line === '' || line.endsWith(';'))) {
      startLine = i + 1;
      break;
    }
    if (i === 0) {
      startLine = 0;
    }
  }

  // Search forwards for statement end
  for (let i = currentLineIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.endsWith(';')) {
      endLine = i;
      break;
    }
    if (i > currentLineIndex && line === '') {
      endLine = i - 1;
      break;
    }
    if (i === lines.length - 1) {
      endLine = i;
    }
  }

  // Extract the statement
  const statementLines = lines.slice(startLine, endLine + 1);
  const statement = statementLines.join('\n').trim().replace(/;$/, '');

  return { statement, found: statement.length > 0 };
};

const executeQuery = async () => {
  if (!editor || !activeConnection.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  // Use smart statement extraction
  const { statement, found } = getStatementToExecute();

  if (!found || !statement) {
    message.warning(lang.t('editor.dynamo.partiql.noStatementFound'), {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  await executePartiqlStatement(statement);
};

const loadMore = async () => {
  if (
    !editor ||
    !activeConnection.value ||
    !partiqlData.value.nextToken ||
    !partiqlData.value.lastExecutedStatement
  )
    return;

  await executePartiqlStatement(
    partiqlData.value.lastExecutedStatement,
    partiqlData.value.nextToken,
  );
};

const handleCloseResultPanel = () => {
  editorSize.value = 1;
  dbDataStore.resetPartiqlData();
};

// Get partition key and sort key info from active connection
const partitionKeyName = computed(
  () => (activeConnection.value as DynamoDBConnection)?.partitionKey?.name ?? '',
);
const partitionKeyType = computed(
  () => (activeConnection.value as DynamoDBConnection)?.partitionKey?.valueType ?? 'S',
);
const sortKeyName = computed(
  () => (activeConnection.value as DynamoDBConnection)?.sortKey?.name ?? undefined,
);
const sortKeyType = computed(
  () => (activeConnection.value as DynamoDBConnection)?.sortKey?.valueType ?? undefined,
);

// Edit/Delete state
const showEditModal = ref(false);
const editingItem = ref<Record<string, unknown> | null>(null);

const handleEdit = (row: Record<string, unknown>) => {
  editingItem.value = row;
  showEditModal.value = true;
};

type AttributeItem = {
  key: string;
  value: string | number | boolean | null;
  type: string;
};

const handleEditSubmit = async (keys: AttributeItem[], attributes: AttributeItem[]) => {
  if (!activeConnection.value) return;

  try {
    loadingRef.value = true;
    const { updateItem } = useConnectionStore();
    await updateItem(activeConnection.value as DynamoDBConnection, keys, attributes);
    message.success(lang.t('editor.dynamo.updateItemSuccess'));
    showEditModal.value = false;
    // Refresh results by re-executing the last statement
    if (partiqlData.value.lastExecutedStatement) {
      await executePartiqlStatement(partiqlData.value.lastExecutedStatement);
    }
  } catch (error) {
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value = false;
  }
};

const handleDelete = (row: Record<string, unknown>) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('editor.dynamo.deleteItemConfirm'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      await performDelete(row);
    },
  });
};

const performDelete = async (row: Record<string, unknown>) => {
  if (!activeConnection.value) return;

  const connection = activeConnection.value as DynamoDBConnection;
  const keys: AttributeItem[] = [];

  // Build keys from the row
  if (partitionKeyName.value && row[partitionKeyName.value] !== undefined) {
    keys.push({
      key: partitionKeyName.value,
      value: row[partitionKeyName.value] as string | number | boolean | null,
      type: partitionKeyType.value,
    });
  }

  if (sortKeyName.value && sortKeyType.value && row[sortKeyName.value] !== undefined) {
    keys.push({
      key: sortKeyName.value,
      value: row[sortKeyName.value] as string | number | boolean | null,
      type: sortKeyType.value,
    });
  }

  try {
    loadingRef.value = true;
    const { deleteItem } = useConnectionStore();
    await deleteItem(connection, keys);
    message.success(lang.t('editor.dynamo.deleteItemSuccess'));
    // Refresh results by re-executing the last statement
    if (partiqlData.value.lastExecutedStatement) {
      await executePartiqlStatement(partiqlData.value.lastExecutedStatement);
    }
  } catch (error) {
    const { status, details } = error as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3600,
    });
  } finally {
    loadingRef.value = false;
  }
};

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
    tabSize: 2,
  });

  if (!editor) return;

  editor.onDidChangeModelContent(() => {
    saveModelContent(false, false, false);
    // Update gutter decorations when content changes
    refreshStatementDecorations();
    // Trigger debounced syntax validation
    const model = editor?.getModel();
    if (model) {
      debouncedValidate(model);
    }
  });

  // Initial decoration refresh
  refreshStatementDecorations();

  // Initial syntax validation
  const model = editor.getModel();
  if (model) {
    validatePartiqlModel(model);
  }

  // Handle left-click on gutter execute button
  editor.onMouseDown(({ event, target }) => {
    // Hide context menu on any click
    hideContextMenu();

    if (
      event.leftButton &&
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(partiqlExecutionGutterClass)
    ) {
      executeStatementAtLine(target.position.lineNumber);
    }
  });

  // Handle right-click on gutter execute button for context menu
  editor.onContextMenu(({ event, target }) => {
    if (
      target.type === MOUSE_TARGET_TYPE_GUTTER_LINE_DECORATIONS &&
      target.element?.classList &&
      Object.values(target.element.classList).includes(partiqlExecutionGutterClass)
    ) {
      event.preventDefault();
      event.stopPropagation();

      // Position context menu near the click
      contextMenuPosition.value = {
        x: event.posx,
        y: event.posy,
      };
      contextMenuStatementLine.value = target.position.lineNumber;
      contextMenuVisible.value = true;
    }
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

  /**
   * Save file (Ctrl+S or Cmd+S on Windows only)
   * On macOS and Linux, the OS handles Cmd+S/Ctrl+S natively via the saveFile event
   * @see https://github.com/tauri-apps/wry/issues/451
   */
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
  // Add document click listener for context menu
  document.addEventListener('click', handleDocumentClick);
});

onUnmounted(async () => {
  await cleanupFileListener();
  // Remove document click listener
  document.removeEventListener('click', handleDocumentClick);
  // Clear validation markers before disposing
  const model = editor?.getModel();
  if (model) {
    clearPartiqlValidation(model);
  }
  editor?.dispose();
});

// Expose methods for parent component
defineExpose({
  executeQuery,
  insertSampleQuery,
  getLoadingState: () => loadingRef.value,
});
</script>

<style lang="scss" scoped>
.partiql-editor {
  width: 100%;
  height: 100%;

  .editor-container {
    width: 100%;
    height: 100%;
    position: relative;

    .monaco-editor-container {
      width: 100%;
      height: 100%;
    }
  }
}

.partiql-context-menu {
  position: fixed;
  background-color: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  border-radius: 4px;
  overflow: hidden;

  ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    min-width: 120px;

    li {
      padding: 6px 12px;
      cursor: pointer;
      font-size: 13px;

      &:hover {
        background: var(--border-color);
      }
    }
  }
}

:deep(.partiql-execute-decoration) {
  cursor: pointer;
  height: 0 !important;
  width: 0 !important;
  margin-top: 3px;
  margin-left: 8px;
  border-radius: 3px;
  border-left-width: 10px;
  border-top-width: 7px;
  border-bottom-width: 7px;
  border-right-width: 0;
  border-top-color: transparent;
  border-left-color: var(--theme-color);
  border-bottom-color: transparent;
  border-right-color: transparent;
  border-style: solid;
}
</style>
