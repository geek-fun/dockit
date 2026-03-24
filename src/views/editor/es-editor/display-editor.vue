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

const display = (content: unknown) => {
  const model = displayEditor?.getModel();
  if (!model) {
    return;
  }
  const type = typeof content === 'object' ? 'json' : 'plain/text';
  const indent = editorConfig.value.insertSpaces ? ' '.repeat(editorConfig.value.tabSize) : '\t';

  const formattedContent =
    type === 'json' ? jsonify.stringify(content, null, indent) : (content ?? '').toString();

  monaco.editor.setModelLanguage(model, type);

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
