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
  buildSearchToken,
  Decoration,
  defaultCodeSnippet,
  Editor,
  EngineType,
  getActionApiDoc,
  monaco,
  SearchAction,
} from '../../common/monaco';

const appStore = useAppStore();
const message = useMessage();
const lang = useLang();

const sourceFileStore = useSourceFileStore();
const { readSourceFromFile, saveSourceToFile } = sourceFileStore;
const { defaultFile } = storeToRefs(sourceFileStore);

const connectionStore = useConnectionStore();
const { searchQDSL } = connectionStore;
const { established } = storeToRefs(connectionStore);
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

const chatStore = useChatStore();
const { insertBoard } = storeToRefs(chatStore);
// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let queryEditor: Editor | null = null;
let autoIndentCmdId: string | null = null;
// DOM
const queryEditorRef = ref();
const displayEditorRef = ref();

let searchTokens: SearchAction[] = [];

const getActionMarksDecorations = (searchTokens: SearchAction[]): Array<Decoration> => {
  return searchTokens
    .map(({ actionPosition }) => ({
      id: actionPosition.startLineNumber,
      range: actionPosition,
      options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
    }))
    .filter(Boolean)
    .sort((a, b) => (a as Decoration).id - (b as Decoration).id) as Array<Decoration>;
};

const refreshActionMarks = (editor: Editor, searchTokens: SearchAction[]) => {
  const freshedDecorations = getActionMarksDecorations(searchTokens);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshedDecorations,
  ) as unknown as Decoration[];
};

const buildCodeLens = (searchTokens: SearchAction[]) =>
  searchTokens
    .filter(({ qdslPosition }) => qdslPosition)
    .map(({ actionPosition, qdslPosition }, index) => ({
      range: actionPosition,
      id: `AutoIndent-${index}`,
      command: { id: autoIndentCmdId!, title: 'Auto Indent', arguments: [qdslPosition] },
    }));

const codeLensProvider = monaco.languages.registerCodeLensProvider('search', {
  provideCodeLenses: () => {
    const model = queryEditor?.getModel();
    if (!model) {
      return;
    }

    const lines = Array.from({ length: model.getLineCount() }, (_, i) => ({
      lineNumber: i + 1,
      lineContent: model.getLineContent(i + 1),
    }));

    searchTokens = buildSearchToken(lines);

    refreshActionMarks(queryEditor!, searchTokens);

    return {
      lenses: buildCodeLens(searchTokens),
      dispose: () => {},
    };
  },
});

const executionGutterClass = 'execute-button-decoration';

let executeDecorations: Array<Decoration | string> = [];

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
    ({ actionPosition }) => actionPosition.startLineNumber === position.lineNumber,
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
    if (action.path.includes('_bulk')) {
      action.qdsl += '\n';
    }
    const data = await searchQDSL({
      ...action,
      queryParams: action.queryParams ?? undefined,
      qdsl: action.qdsl ?? undefined,
      index: action.index || established.value?.activeIndex?.index,
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

const autoIndentAction = (
  editor: monaco.editor.IStandaloneCodeEditor,
  // @ts-ignore
  ctx: unknown,
  qdslPosition:
    | {
        startLineNumber: number;
        endLineNumber: number;
      }
    | undefined,
) => {
  const model = editor?.getModel();
  if (!qdslPosition || !model) {
    return;
  }

  const { startLineNumber, endLineNumber } = qdslPosition;
  const content = model.getValueInRange({
    startLineNumber,
    startColumn: 1,
    endLineNumber: endLineNumber,
    endColumn: model.getLineLength(endLineNumber) + 1,
  });
  try {
    const formatted = JSON.stringify(JSON.parse(content), null, 2);
    model.pushEditOperations(
      [],
      [
        {
          range: {
            startLineNumber,
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

const getPointerAction = (editor: Editor, tokens: Array<SearchAction>) => {
  const { lineNumber } = editor?.getPosition() || {};
  if (lineNumber === undefined || lineNumber === null) {
    return;
  }

  return tokens.find(({ actionPosition: { startLineNumber }, qdslPosition }) =>
    qdslPosition
      ? lineNumber >= startLineNumber && lineNumber <= qdslPosition.endLineNumber
      : startLineNumber === lineNumber,
  );
};

const setupQueryEditor = (code: string) => {
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    automaticLayout: true,
    theme: getEditorTheme(),
    value: code ? code : defaultCodeSnippet,
    language: 'search',
    minimap: { enabled: false },
  });
  if (!queryEditor) {
    return;
  }

  autoIndentCmdId = queryEditor.addCommand(0, (ctx, args) =>
    autoIndentAction(queryEditor!, ctx, args),
  );

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
    const { qdslPosition } = getPointerAction(queryEditor!, searchTokens) || {};
    autoIndentAction(queryEditor!, null, qdslPosition);
  });

  // Toggle Autocomplete
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
    queryEditor!.trigger('keyboard', 'editor.action.triggerSuggest', {});
  });

  // Submit request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    const { actionPosition } = getPointerAction(queryEditor!, searchTokens) || {};
    if (actionPosition) {
      executeQueryAction({
        column: actionPosition.startColumn,
        lineNumber: actionPosition.startLineNumber,
      });
    }
  });

  // Jump to the previous request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow, () => {
    const position = queryEditor?.getPosition();
    if (!position) {
      return;
    }
    const { actionPosition } =
      searchTokens
        .filter(({ actionPosition }) => actionPosition)
        .sort((a, b) => b.actionPosition.startLineNumber - a.actionPosition.startLineNumber)
        .find(({ actionPosition: { startLineNumber } }) => startLineNumber < position.lineNumber) ||
      {};

    if (actionPosition) {
      queryEditor!.revealLine(actionPosition.startLineNumber);
      queryEditor!.setPosition({
        column: position.column,
        lineNumber: actionPosition.startLineNumber,
      });
    }
  });

  // Jump to the next request
  queryEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, () => {
    const position = queryEditor?.getPosition();
    if (!position) {
      return;
    }
    const { actionPosition } =
      searchTokens
        .filter(({ actionPosition }) => actionPosition)
        .sort((a, b) => a.actionPosition.startLineNumber - b.actionPosition.startLineNumber)
        .find(({ actionPosition: { startLineNumber } }) => startLineNumber > position.lineNumber) ||
      {};

    if (actionPosition) {
      queryEditor!.revealLine(actionPosition.startLineNumber);
      queryEditor!.setPosition({
        column: position.column,
        lineNumber: actionPosition.startLineNumber,
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
      getPointerAction(queryEditor!, searchTokens)!,
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

onMounted(async () => {
  await readSourceFromFile();
  const code = defaultFile.value;
  setupQueryEditor(code);
});

onUnmounted(() => {
  codeLensProvider.dispose();
  queryEditor?.dispose();
  displayEditorRef.value.dispose();
});
// @ts-ignore
listen('saveFile', async event => {
  if (!queryEditor) {
    return;
  }
  await saveSourceToFile(queryEditor.getModel()!.getValue() || '');
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

:deep(.mtk19) {
  color: #00756c;
}
:deep(.mtk22) {
  color: #c80a68;
}
</style>
