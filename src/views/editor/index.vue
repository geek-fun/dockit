<template>
  <n-split direction="horizontal" class="editor" v-model:size="queryEditorSize">
    <template #1>
      <div id="query-editor" ref="queryEditorRef" />
    </template>
    <template #2>
      <display-editor id="display-editor" ref="displayEditorRef" />
    </template>
  </n-split>
</template>
<script setup lang="ts">
import { useRoute } from 'vue-router';
import { open } from '@tauri-apps/api/shell';
import { listen } from '@tauri-apps/api/event';
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import { CustomError } from '../../common';
import { useAppStore, useChatStore, useConnectionStore, useSourceFileStore } from '../../store';
import { useLang } from '../../lang';
import DisplayEditor from './display-editor.vue';

import {
  buildCodeLens,
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
} from '../../common/monaco';

const appStore = useAppStore();
const message = useMessage();
const lang = useLang();

const route = useRoute();

const sourceFileStore = useSourceFileStore();
const { readSourceFromFile, saveSourceToFile } = sourceFileStore;
const { fileContent } = storeToRefs(sourceFileStore);

const connectionStore = useConnectionStore();
const { searchQDSL, queryToCurl } = connectionStore;
const { established } = storeToRefs(connectionStore);
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

const chatStore = useChatStore();
const { insertBoard } = storeToRefs(chatStore);
// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let queryEditor: Editor | null = null;
let autoIndentCmdId: string | null = null;
let copyCurlCmdId: string | null = null;
// DOM
const queryEditorRef = ref();
const displayEditorRef = ref();

let executeDecorations: Array<Decoration | string> = [];
let currentAction: SearchAction | undefined = undefined;

const refreshActionMarks = (editor: Editor, searchTokens: SearchAction[]) => {
  const freshDecorations = getActionMarksDecorations(searchTokens);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshDecorations,
  ) as unknown as Decoration[];
};

const codeLensProvider = monaco.languages.registerCodeLensProvider('search', {
  onDidChange: (listener, thisArg) => {
    const model = queryEditor!.getModel();
    // refresh at first loading
    if (model) {
      buildSearchToken(model);
      refreshActionMarks(queryEditor!, searchTokens);
    }
    return queryEditor!.onDidChangeCursorPosition(acc => {
      // only updates the searchTokens when content edited, past, redo, undo
      if ([0, 4, 6, 5].includes(acc.reason)) {
        if (!model) {
          return;
        }

        buildSearchToken(model);

        refreshActionMarks(queryEditor!, searchTokens);
      }

      const newAction = getAction(acc.position);
      if (newAction && newAction !== currentAction) {
        currentAction = newAction;
        return listener(thisArg);
      }
    });
  },
  provideCodeLenses: () => {
    const position = queryEditor!.getPosition();
    const lenses = position ? buildCodeLens(position, autoIndentCmdId!, copyCurlCmdId!) : [];

    return {
      lenses,
      dispose: () => {},
    };
  },
});

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  queryEditor?.updateOptions({ theme: vsTheme });
});
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
    if (!established.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
      });
      return;
    }

    const data = await searchQDSL({
      ...action,
      queryParams: action.queryParams ?? undefined,
      qdsl: transformQDSL(action),
      index: action.index,
    });

    displayJsonEditor(JSON.stringify(data, null, '  '));
  } catch (err) {
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
      inverseEditOperations => [],
    );
  } catch (err) {
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
    navigator.clipboard.writeText(queryToCurl(action));
    message.success(lang.t('editor.copySuccess'));
  } catch (err) {
    message.error(`${lang.t('editor.copyFailed')}: ${JSON.stringify(err)}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

const setupQueryEditor = (code: string) => {
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    theme: getEditorTheme(),
    value: code,
    language: 'search',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
  });
  if (!queryEditor) {
    return;
  }

  autoIndentCmdId = queryEditor.addCommand(0, (...args) => autoIndentAction(queryEditor!, args[1]));
  copyCurlCmdId = queryEditor.addCommand(0, (...args) => copyCurlAction(args[1]));

  queryEditor.onMouseDown(({ event, target }) => {
    if (
      event.leftButton &&
      target.type === 4 &&
      Object.values(target!.element!.classList).includes(executionGutterClass) &&
      queryEditor
    ) {
      executeQueryAction(target.position);
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
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
    const docLink = getActionApiDoc(
      EngineType.ELASTICSEARCH,
      'current',
      getAction(queryEditor?.getPosition()) as SearchAction,
    );
    if (docLink) {
      open(docLink);
    }
  });
};

const queryEditorSize = ref(1);

const displayJsonEditor = (content: string) => {
  queryEditorSize.value = queryEditorSize.value === 1 ? 0.5 : queryEditorSize.value;
  displayEditorRef.value.display(content);
};

const unlistenSaveFile = ref<Function>();
const saveFileListener = async () => {
  unlistenSaveFile.value = await listen('saveFile', async () => {
    const model = queryEditor?.getModel();
    if (!model) {
      return;
    }
    await saveSourceToFile(model.getValue() || '');
  });
};

watch(
  () => fileContent.value,
  async () => {
    if (queryEditor) {
      queryEditor.setValue(fileContent.value);
    }
  },
);
onMounted(async () => {
  await readSourceFromFile(route.params.filePath as string);
  const code = fileContent.value;
  await saveFileListener();
  setupQueryEditor(code);
});

onUnmounted(() => {
  codeLensProvider?.dispose();
  queryEditor?.dispose();
  displayEditorRef?.value?.dispose();
  if (unlistenSaveFile?.value) {
    unlistenSaveFile.value();
  }
});
</script>

<style lang="scss" scoped>
.editor {
  width: 100%;
  height: 100%;

  #query-editor {
    width: 100%;
    height: 100%;
  }

  #display-editor {
    width: 100%;
    height: 100%;
    border-left: 1px solid var(--border-color);
  }
}

:deep(.execute-button-decoration) {
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

:deep(.mtk14, .mtk19) {
  color: #00756c;
}

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
