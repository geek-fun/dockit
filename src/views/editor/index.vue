<template>
  <div class="editor">
    <div id="query-editor" ref="queryEditorRef"></div>
    <div id="display-editor" ref="displayEditorRef"></div>
  </div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { storeToRefs } from 'pinia';
import { ref, onMounted, watch } from 'vue';
import { CustomError, Decoration, executeActions, searchTokensProvider } from '../../common';
import { useAppStore, useSourceFileStore, useConnectionStore, ThemeType } from '../../store';
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

monaco.languages.registerCodeLensProvider('search', {
  provideCodeLenses: () => {
    const model = queryEditor?.getModel();
    if (!model) {
      console.log('no model');
      return;
    }
    const codeLens: monaco.languages.CodeLens[] = [];
    for (let i = 1; i <= model.getLineCount(); i++) {
      const lineContent = model.getLineContent(i);
      console.log(
        'loop lineContent',
        lineContent,
        'index',
        i,
        'model.getLineCount()',
        model.getLineCount(),
      );
      if (executeActions.regexp.test(lineContent)) {
        codeLens.push({
          range: new monaco.Range(i, 1, i, 1),
          id: `AutoIndent-${i}`,
          command: {
            id: `AutoIndent-${i}`,
            title: 'Auto Indent',
            arguments: [i],
          },
        });
      }
    }
    return { lenses: codeLens, dispose: () => {} };
  },
  resolveCodeLens: (model, codeLens) => {
    return codeLens;
  },
});

// https://github.com/tjx666/adobe-devtools/commit/8055d8415ed3ec5996880b3a4ee2db2413a71c61
let displayEditor: Editor | null = null;
let queryEditor: Editor | null = null;
// DOM
const queryEditorRef = ref();
const displayEditorRef = ref();

const executionGutterClass = 'execute-button-decoration';
const executeDecorationType = 'action-execute-decoration.search';

let executeDecorations: Array<Decoration | string> = [];

watch(themeType, () => {
  const vsTheme = getEditorTheme();

  queryEditor?.updateOptions({ theme: vsTheme });
  displayEditor?.updateOptions({ theme: vsTheme });
});

const getActionMarksDecorations = (editor: Editor): Array<Decoration> => {
  // Get the model of the editor
  const model = editor.getModel();
  // Tokenize the entire content of the model
  const tokens = monaco.editor.tokenize(model!.getValue(), model!.getLanguageId());
  return tokens
    .map(
      (line, lineIndex) =>
        line.some(({ type }) => type === executeDecorationType) && {
          id: lineIndex + 1,
          range: new monaco.Range(lineIndex + 1, 1, lineIndex + 1, 1),
          options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
        },
    )
    .filter(Boolean)
    .sort((a, b) => (a as Decoration).id - (b as Decoration).id) as Array<Decoration>;
};

const refreshActionMarks = (editor: Editor) => {
  const freshedDecorations = getActionMarksDecorations(editor);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(
    executeDecorations as Array<string>,
    freshedDecorations,
  ) as unknown as Decoration[];
};

const getAction = (editor: Editor, startLine: number) => {
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const commands = model.getLineContent(startLine).split(/[\/\s]+/);
  const method = commands[0]?.toUpperCase();
  const index = commands[1]?.startsWith('_') ? undefined : commands[1];
  const path = commands.slice(index ? 2 : 1, commands.length).join('/');

  let qdsl = '';
  // Get  non-comment payload
  for (let lineNumber = startLine + 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const lineContent = model.getLineContent(lineNumber);
    if (lineContent.trim() === '') {
      break;
    }
    if (lineContent.trim().startsWith('//')) {
      continue;
    }
    qdsl += lineContent;
  }

  return { qdsl, method, index, path };
};

const executeQueryAction = async (
  queryEditor: Editor,
  displayEditor: Editor,
  position: { column: number; lineNumber: number },
) => {
  const action = getAction(queryEditor, position.lineNumber);
  if (!action) {
    return;
  }
  try {
    if (!established.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
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
      duration: 3000,
    });
  }
};

const setupQueryEditor = (code: string) => {
  queryEditor = monaco.editor.create(queryEditorRef.value, {
    automaticLayout: true,
    theme: getEditorTheme(),
    value: code,
    language: 'search',
  });

  // Register language injection rule
  queryEditor.onKeyUp(event => queryEditor && refreshActionMarks(queryEditor));
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

  queryEditor.addAction({
    id: 'AutoIndent',
    label: 'Auto Indent',
    run: (ed, args) => {
      console.log('FormatQuery', { ed, args });
      try {
        const model = queryEditor?.getModel();
        if (model) {
          const formatted = monaco.languages.json.jsonDefaults.format(model.getValue());
          model.setValue(formatted);
        }
      } catch (e) {
        console.error(e);
      }
    },
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
