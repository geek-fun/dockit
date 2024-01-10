<template>
  <div class="editor">
    <div id="query-editor" ref="queryEditorRef"></div>
    <div id="display-editor" ref="displayEditorRef"></div>
  </div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { storeToRefs } from 'pinia';
import { CustomError, Decoration, searchTokensProvider } from '../../common';
import { useAppStore, useSourceFileStore, useConnectionStore } from '../../store';
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
// DOM
const queryEditorRef = ref();
const displayEditorRef = ref();

const executionGutterClass = 'execute-button-decoration';
const executeDecorationType = 'action-execute-decoration.search';

let executeDecorations: Array<Decoration | string> = [];

const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
const systemTheme = ref(themeMedia.matches);
themeMedia.addListener(e => {
  systemTheme.value = e.matches;
});

// set Editoer theme name
const editorTheme = computed(() => {
  // 'vs-dark',
  let isDark = appStore.themeType === 0 ? !systemTheme.value : appStore.themeType === 1;
  return isDark ? 'vs-dark' : 'vs-light';
});

watch(
  () => editorTheme.value,
  () => {
    queryEditor?.updateOptions({ theme: editorTheme.value });
    displayEditor?.updateOptions({ theme: editorTheme.value });
  },
);

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
    // eslint-disable-next-line no-console
    console.log(`execute ${JSON.stringify({ action })}`);
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
    theme: editorTheme.value,
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
};
const setupJsonEditor = () => {
  displayEditor = monaco.editor.create(displayEditorRef.value, {
    automaticLayout: true,
    theme: editorTheme.value,
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
  background: red;
  cursor: pointer;
  width: 15px !important;
  margin-left: 3px;
}
</style>
