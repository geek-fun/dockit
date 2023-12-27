<template>
  <div id="editor" ref="editorRef"></div>
</template>
<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { storeToRefs } from 'pinia';
import { searchTokensProvider } from '../../common/searchTokensProvider';
import { useAppStore, useSourceFileStore } from '../../store';

const appStore = useAppStore();

const sourceFileStore = useSourceFileStore();
const { readSourceFromFile } = sourceFileStore;
const { defaultFile } = storeToRefs(sourceFileStore);
readSourceFromFile();

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

const refreshActionMarks = (editor: monaco.Editor) => {
  // Get the model of the editor
  const model = editor.getModel();

  // Tokenize the entire content of the model
  const tokens = monaco.editor.tokenize(model!.getValue(), model!.getLanguageId());
  const freshedDecorations = tokens
    .map(
      (line, lineIndex) =>
        line.some(({ type }) => type === executeDecorationType) && {
          id: lineIndex + 1,
          range: new monaco.Range(lineIndex + 1, 1, lineIndex + 1, 1),
          options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
        },
    )
    .filter(Boolean) as Array<Decoration>;
  // @See https://github.com/Microsoft/monaco-editor/issues/913#issuecomment-396537569
  executeDecorations = editor.deltaDecorations(executeDecorations, freshedDecorations);
};

const executeQueryAction = (
  editor: monaco.Editor,
  position: { column: number; lineNumber: number },
) => {
  const model = editor.getModel();
  const lineContent = model.getLineContent(position.lineNumber);
  // eslint-disable-next-line no-console
  console.log(`lineContent ${lineContent}`);
  // eslint-disable-next-line no-console
  console.log(`executeQueryAction ${JSON.stringify(executeDecorations)}`);
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
  editor.onKeyUp(e => {
    refreshActionMarks(editor);
  });
  editor.onMouseDown(e => {
    if (
      e.event.leftButton &&
      e.target.type === 4 &&
      Object.values(e.target!.element!.classList).includes(executionGutterClass)
    ) {
      executeQueryAction(editor, e.target.position);
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
