<template>
  <div id="editor" ref="editorRef"></div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { storeToRefs } from 'pinia';
import { CustomError, searchTokensProvider } from '../../common';
import { useAppStore, useSourceFileStore, useConnectionStore } from '../../store';
import { useLang } from '../../lang';

const appStore = useAppStore();
const message = useMessage();
const lang = useLang();

const sourceFileStore = useSourceFileStore();
const { readSourceFromFile } = sourceFileStore;
const { defaultFile } = storeToRefs(sourceFileStore);
readSourceFromFile();

const connectionStore = useConnectionStore();
const { searchQDSL } = connectionStore;
const { established } = storeToRefs(connectionStore);

/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
monaco.languages.register({ id: 'search' });
monaco.languages.setMonarchTokensProvider('search', searchTokensProvider);

// DOM
const editorRef = ref();

const editorView = ref();
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
    editorView.value.updateOptions({ theme: editorTheme.value });
  },
);

const code = defaultFile.value;

const executionGutterClass = 'execute-button-decoration';
const executeDecorationType = 'action-execute-decoration.search';
type Decoration = {
  id: number;
  range: monaco.Range;
  options: { isWholeLine: boolean; linesDecorationsClassName: string };
};

let executeDecorations: Array<Decoration> = [];

const getActionMarksDecorations = (editor: monaco.Editor): Array<Decoration> => {
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

const refreshActionMarks = (editor: monaco.Editor) => {
  const freshedDecorations = getActionMarksDecorations(editor);
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(executeDecorations, freshedDecorations);
};
const getAction = (editor: monaco.Editor, startLine: number) => {
  const model = editor.getModel();
  const action = model.getLineContent(startLine);

  let payload = '';
  // Get  non-comment payload
  for (let lineNumber = startLine + 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const lineContent = model.getLineContent(lineNumber);
    if (lineContent.trim() === '') {
      break;
    }
    if (lineContent.trim().startsWith('//')) {
      continue;
    }
    payload += lineContent;
  }

  return { payload, action };
};

const executeQueryAction = async (
  editor: monaco.Editor,
  position: { column: number; lineNumber: number },
) => {
  const { action, payload } = getAction(editor, position.lineNumber);
  try {
    // eslint-disable-next-line no-console
    console.log(
      `executeQueryAction ${JSON.stringify({
        payload,
        action,
      })}`,
    );
    if (!established.value) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }

    const data = await searchQDSL(established.value.activeIndex.index, payload);
    // eslint-disable-next-line no-console
    console.log(`data ${JSON.stringify({ data })}`);
  } catch (err) {
    const { status, details } = err as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 36000000,
    });
  }
};

onMounted(() => {
  const editor = monaco.editor.create(editorRef.value, {
    automaticLayout: true,
    theme: editorTheme.value,
    value: code,
    language: 'search',
  });
  editorView.value = editor;
  // Register language injection rule
  editor.onKeyUp(event => refreshActionMarks(editor));
  editor.onMouseDown(({ event, target }) => {
    if (
      event.leftButton &&
      target.type === 4 &&
      Object.values(target!.element!.classList).includes(executionGutterClass)
    ) {
      executeQueryAction(editor, target.position);
    }
  });
});
</script>

<style lang="scss">
#editor {
  width: 100%;
  height: 100%;
}

.execute-button-decoration {
  background: red;
  cursor: pointer;
  width: 15px !important;
  margin-left: 3px;
}
</style>
