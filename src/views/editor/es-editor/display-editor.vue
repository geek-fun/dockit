<template>
  <div id="display-editor" ref="displayEditorRef"></div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Editor, monaco } from '../../../common/monaco';
import { useAppStore } from '../../../store';
import { jsonify } from '../../../common';

const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

let displayEditor: Editor | null = null;
const displayEditorRef = ref();
const setupDisplayEditor = () => {
  const editorOptions = getEditorOptions();
  displayEditor = monaco.editor.create(displayEditorRef.value, {
    theme: getEditorTheme(),
    value: '',
    language: 'json',
    automaticLayout: true,
    readOnly: true,
    scrollBeyondLastLine: false,
    ...editorOptions,
  });
  displayEditor.getModel()?.updateOptions({
    tabSize: editorOptions.tabSize,
    insertSpaces: editorOptions.insertSpaces,
  });
};

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  displayEditor?.updateOptions({ theme: vsTheme });
});

watch(
  editorConfig,
  () => {
    const options = getEditorOptions();
    displayEditor?.updateOptions(options);
    displayEditor?.getModel()?.updateOptions({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  },
  { deep: true },
);

const resolveLanguage = (content: unknown, format?: string): string => {
  if (format === 'yaml') return 'yaml';
  if (typeof content === 'object') return 'json';
  return 'plaintext';
};

const display = (content: unknown, format?: string) => {
  const model = displayEditor?.getModel();
  if (!model) {
    return;
  }
  const language = resolveLanguage(content, format);
  const indent = editorConfig.value.insertSpaces ? ' '.repeat(editorConfig.value.tabSize) : '\t';

  const formattedContent =
    language === 'json' ? jsonify.stringify(content, null, indent) : (content ?? '').toString();

  monaco.editor.setModelLanguage(model, language);

  model.setValue(formattedContent);
};

const dispose = () => {
  displayEditor?.dispose();
};

defineExpose({ display, dispose });

onMounted(() => {
  setupDisplayEditor();
});
</script>

<style scoped></style>
