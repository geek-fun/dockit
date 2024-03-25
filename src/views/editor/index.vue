<template>
  <div class="editor">
    <div id="query-editor" ref="queryEditorRef"></div>
    <div id="display-editor" ref="displayEditorRef"></div>
  </div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useMessage } from 'naive-ui';
import {
  buildSearchToken,
  CustomError,
  Decoration,
  defaultCodeSnippet,
  SearchToken,
  searchTokensProvider,
} from '../../common';
import { useAppStore, useConnectionStore, useSourceFileStore } from '../../store';
import { useLang } from '../../lang';

type Editor = ReturnType<typeof monaco.editor.create>;

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
/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
self.MonacoEnvironment = {
  async getWorker(_, label) {
    let worker;

    switch (label) {
      case 'json':
        worker = await import('monaco-editor/esm/vs/language/json/json.worker?worker');
        break;
      case 'css':
      case 'scss':
      case 'less':
        worker = await import('monaco-editor/esm/vs/language/css/css.worker?worker');
        break;
      case 'html':
      case 'handlebars':
      case 'razor':
        worker = await import('monaco-editor/esm/vs/language/html/html.worker?worker');
        break;
      case 'typescript':
      case 'javascript':
        worker = await import('monaco-editor/esm/vs/language/typescript/ts.worker?worker');
        break;
      default:
        worker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
    }

    return new worker.default();
  },
};
monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);

monaco.languages.register({ id: 'search' });

monaco.languages.setMonarchTokensProvider(
  'search',
  searchTokensProvider as monaco.languages.IMonarchLanguage,
);

// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let displayEditor: Editor | null = null;
let queryEditor: Editor | null = null;
let autoIndentCmdId: string | null = null;
// DOM
const queryEditorRef = ref();
const displayEditorRef = ref();

let searchTokens: SearchToken[] = [];

const getActionMarksDecorations = (searchTokens: SearchToken[]): Array<Decoration> => {
  return searchTokens
    .map(({ actionPosition }) => ({
      id: actionPosition.startLineNumber,
      range: actionPosition,
      options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
    }))
    .filter(Boolean)
    .sort((a, b) => (a as Decoration).id - (b as Decoration).id) as Array<Decoration>;
};

const refreshActionMarks = (editor: Editor, searchTokens: SearchToken[]) => {
  const freshedDecorations = getActionMarksDecorations(searchTokens);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshedDecorations,
  ) as unknown as Decoration[];
};
const buildCodeLens = (searchTokens: SearchToken[]) =>
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

    return { lenses: buildCodeLens(searchTokens), dispose: () => {} };
  },
});

const executionGutterClass = 'execute-button-decoration';

let executeDecorations: Array<Decoration | string> = [];

watch(themeType, () => {
  const vsTheme = getEditorTheme();

  queryEditor?.updateOptions({ theme: vsTheme });
  displayEditor?.updateOptions({ theme: vsTheme });
});

const executeQueryAction = async (
  queryEditor: Editor,
  displayEditor: Editor,
  position: { column: number; lineNumber: number },
) => {
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

    const data = await searchQDSL({
      ...action,
      index: action.index || established.value?.activeIndex?.index,
    });
    displayEditor?.getModel()?.setValue(JSON.stringify(data, null, '  '));
  } catch (err) {
    const { status, details } = err as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
    });
  }
};

const setupQueryEditor = (code: string) => {
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    automaticLayout: true,
    theme: getEditorTheme(),
    value: code ? code : defaultCodeSnippet,
    language: 'search',
  });

  autoIndentCmdId = queryEditor.addCommand(
    0,
    (
      ctx,
      args:
        | {
            startLineNumber: number;
            endLineNumber: number;
          }
        | undefined,
    ) => {
      if (!args) {
        return;
      }
      const model = queryEditor?.getModel();
      if (!model) {
        return;
      }

      const { startLineNumber, endLineNumber } = args;
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
          inverseEditOperations => [],
        );
      } catch (err) {
        message.error(lang.t('editor.invalidJson'), {
          closable: true,
          keepAliveOnHover: true,
        });
        return;
      }
    },
  );

  queryEditor.onMouseDown(({ event, target }) => {
    if (
      event.leftButton &&
      target.type === 4 &&
      Object.values(target!.element!.classList).includes(executionGutterClass) &&
      queryEditor &&
      displayEditor
    ) {
      executeQueryAction(queryEditor, displayEditor, target.position);
    }
  });
};
const setupJsonEditor = () => {
  displayEditor = monaco.editor.create(displayEditorRef.value, {
    automaticLayout: true,
    theme: getEditorTheme(),
    value: '',
    language: 'json',
  });
};
onMounted(async () => {
  await readSourceFromFile();
  const code = defaultFile.value;
  setupQueryEditor(code);
  setupJsonEditor();
});

onUnmounted(() => {
  codeLensProvider.dispose();
});

const { sourceFileAPI } = window;

sourceFileAPI.onSaveShortcut(async () => {
  if (!queryEditor) {
    return;
  }
  await saveSourceToFile(queryEditor.getModel()!.getValue() || '');
});
</script>

<style lang="scss">
.editor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-flow: row nowrap;

  #query-editor {
    width: 50%;
    height: 100%;
  }

  #display-editor {
    width: 50%;
    height: 100%;
    border-left: 1px solid var(--border-color);
  }
}

.execute-button-decoration {
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
