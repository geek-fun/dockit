<template>
  <n-split direction="vertical" class="partiql-editor" v-model:size="editorSize">
    <template #1>
      <div class="editor-container">
        <div id="partiql-editor" ref="editorRef" class="monaco-editor-container" />
      </div>
    </template>
    <template #2>
      <result-panel
        v-show="showResultPanel"
        :error-message="errorMessage"
        :has-data="!!queryResult"
        :columns="resultColumns"
        :data="queryResult?.items ?? []"
        :item-count="queryResult?.count"
        :scroll-x="tableScrollWidth"
        :loading="loadingRef"
        :has-next-token="!!queryResult?.next_token"
        @load-more="loadMore"
      />
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
import ResultPanel from './result-panel.vue';

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
const editorSize = ref(1);
const showResultPanel = ref(false);
const loadingRef = ref(false);
const errorMessage = ref<string | null>(null);
const queryResult = ref<PartiQLResult | null>(null);
const currentNextToken = ref<string | null>(null);
const lastExecutedStatement = ref<string | null>(null);

const resultColumns = computed<DataTableColumn[]>(() => {
  if (!queryResult.value?.items?.length) return [];

  const allKeys = new Set<string>();
  queryResult.value.items.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });

  return Array.from(allKeys).map(key => ({
    title: key,
    key,
    minWidth: 120,
    resizable: true,
    render: (row: Record<string, unknown>) => {
      const value = row[key];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'object') return jsonify.stringify(value);
      return String(value);
    },
  }));
});

const tableScrollWidth = computed(() => {
  const columnCount = resultColumns.value.length;
  return Math.max(800, columnCount * 150);
});

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
          range: new monaco.Range(position.lineNumber, currentLineLength + 1, position.lineNumber, currentLineLength + 1),
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
  const statement = statementLines.join('\n').trim().replace(/;$/, '').trim();

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
    message.warning('No PartiQL statement to execute. Please select a query or position your cursor within a statement.', {
      closable: true,
      keepAliveOnHover: true,
    });
    return;
  }

  loadingRef.value = true;
  errorMessage.value = null;
  queryResult.value = null;
  currentNextToken.value = null;
  lastExecutedStatement.value = statement;
  showResultPanel.value = true;
  editorSize.value = 0.5;

  try {
    const result = await dynamoApi.executeStatement(
      activeConnection.value as DynamoDBConnection,
      { statement },
    );
    queryResult.value = result;
    currentNextToken.value = result.next_token;
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

const loadMore = async () => {
  if (!editor || !activeConnection.value || !currentNextToken.value || !lastExecutedStatement.value) return;

  loadingRef.value = true;

  try {
    const result = await dynamoApi.executeStatement(
      activeConnection.value as DynamoDBConnection,
      { statement: lastExecutedStatement.value, nextToken: currentNextToken.value },
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
});

onUnmounted(async () => {
  await cleanupFileListener();
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

    .monaco-editor-container {
      width: 100%;
      height: 100%;
    }
  }
}
</style>
