<template>
  <div id="display-editor" ref="displayEditorRef"></div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Editor, monaco } from '../../../common/monaco';
import { useAppStore } from '../../../store';
import { jsonify } from '../../../common';

const appStore = useAppStore();
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

let displayEditor: Editor | null = null;
const displayEditorRef = ref();
const setupDisplayEditor = () => {
  displayEditor = monaco.editor.create(displayEditorRef.value, {
    theme: getEditorTheme(),
    value: '',
    language: 'json',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
  });
};

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  displayEditor?.updateOptions({ theme: vsTheme });
});

const display = (content: unknown) => {
  const model = displayEditor?.getModel();
  if (!model) {
    return;
  }
  const type = typeof content === 'object' ? 'json' : 'plain/text';

  const formattedContent =
    type === 'json' ? jsonify.stringify(content, null, '  ') : (content ?? '').toString();

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
