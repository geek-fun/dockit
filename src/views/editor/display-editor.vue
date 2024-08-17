<template>
  <div id="display-editor" ref="displayEditorRef"></div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Editor, monaco } from '../../common/monaco';
import { useAppStore } from '../../store';

const appStore = useAppStore();
const { getEditorTheme } = appStore;
const { themeType } = storeToRefs(appStore);

let displayEditor: Editor | null = null;
const displayEditorRef = ref();
const setupJsonEditor = () => {
  displayEditor = monaco.editor.create(displayEditorRef.value, {
    automaticLayout: true,
    theme: getEditorTheme(),
    value: '',
    language: 'json',
    minimap: { enabled: false },
  });
};

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  displayEditor?.updateOptions({ theme: vsTheme });
});

const display = (content: string) => {
  if (displayEditor) {
    displayEditor?.getModel()?.setValue(content);
  }
};
const dispose = () => {
  displayEditor?.dispose();
};
defineExpose({ display, dispose });

onMounted(() => {
  setupJsonEditor();
});
</script>

<style scoped></style>
