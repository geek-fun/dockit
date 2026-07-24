<template>
  <div ref="editorRef" class="json-view" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { Editor, monaco } from '@/common/monaco';
import { jsonify } from '@/common';
import { useAppStore } from '@/store';

const props = defineProps<{
  value: unknown;
}>();

const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

const editorRef = ref<HTMLElement>();
let editor: Editor | null = null;

const setContent = () => {
  if (!editor) return;
  const indent = editorConfig.value.insertSpaces ? ' '.repeat(editorConfig.value.tabSize) : '\t';
  editor.setValue(jsonify.stringify(props.value, null, indent));
};

const init = () => {
  if (!editorRef.value) return;
  if (editor) {
    setContent();
    return;
  }
  const options = getEditorOptions();
  editor = monaco.editor.create(editorRef.value, {
    theme: getEditorTheme(),
    value: '',
    language: 'json',
    automaticLayout: true,
    readOnly: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    lineNumbers: 'off',
    folding: true,
    ...options,
  });
  editor.getModel()?.updateOptions({
    tabSize: options.tabSize,
    insertSpaces: options.insertSpaces,
  });
  setContent();
};

watch(themeType, () => {
  editor?.updateOptions({ theme: getEditorTheme() });
});

watch(
  editorConfig,
  () => {
    const options = getEditorOptions();
    editor?.updateOptions(options);
    editor?.getModel()?.updateOptions({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  },
  { deep: true },
);

watch(
  () => props.value,
  () => {
    setContent();
  },
  { deep: true },
);

onMounted(() => {
  init();
});

onUnmounted(() => {
  editor?.dispose();
  editor = null;
});
</script>

<style scoped>
.json-view {
  flex: 1;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
</style>
