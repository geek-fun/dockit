<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] h-[78vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>
          {{ $t('manage.schema.title') }}
          <span v-if="indexName" class="schema-index-name">{{ indexName }}</span>
        </DialogTitle>
      </DialogHeader>

      <div v-if="loading" class="schema-loading">
        <Spinner class="mx-auto" />
      </div>

      <div v-else-if="errorMessage" class="schema-error">
        <p class="text-destructive text-sm">{{ errorMessage }}</p>
      </div>

      <div v-else ref="schemaEditorRef" class="schema-editor macos-scrollable" />

      <DialogFooter>
        <Button size="sm" @click="handleCopy" :disabled="!mapping">
          <span class="i-carbon-copy h-3.5 w-3.5 mr-1.5" />
          {{ $t('manage.schema.copy') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CustomError, jsonify } from '@/common';
import { Editor, monaco } from '@/common/monaco';
import { esApi } from '@/datasources';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';
import { useAppStore } from '@/store';
import type { SearchConnection } from '@/store';

const props = defineProps<{
  open: boolean;
  connection: SearchConnection | undefined;
  indexName: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const lang = useLang();
const message = useMessageService();
const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType, editorConfig } = storeToRefs(appStore);

const loading = ref(false);
const errorMessage = ref('');
const mapping = ref<unknown>(null);
const schemaEditorRef = ref<HTMLElement>();

let schemaEditor: Editor | null = null;
let editorInitialized = false;

const formatted = computed(() => {
  if (mapping.value === null || mapping.value === undefined) return '';
  try {
    return jsonify.stringify(mapping.value, null, 2);
  } catch {
    return String(mapping.value);
  }
});

const initEditor = async () => {
  if (editorInitialized || !schemaEditorRef.value) return;

  await nextTick();
  if (!schemaEditorRef.value) return;

  const editorOptions = getEditorOptions();
  schemaEditor = monaco.editor.create(schemaEditorRef.value, {
    theme: getEditorTheme(),
    value: '',
    language: 'json',
    automaticLayout: true,
    readOnly: true,
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    lineNumbers: 'off',
    folding: true,
    ...editorOptions,
  });
  schemaEditor.getModel()?.updateOptions({
    tabSize: editorOptions.tabSize,
    insertSpaces: editorOptions.insertSpaces,
  });
  editorInitialized = true;
};

const updateEditorContent = () => {
  if (!schemaEditor) return;
  const model = schemaEditor.getModel();
  if (!model) return;
  model.setValue(formatted.value);
};

const loadMapping = async () => {
  if (!props.connection || !props.indexName) return;

  loading.value = true;
  errorMessage.value = '';
  mapping.value = null;

  try {
    mapping.value = await esApi.getIndexMapping(props.connection, props.indexName);
  } catch (err) {
    errorMessage.value =
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(formatted.value);
    message.success(lang.t('manage.schema.copied'));
  } catch {
    message.error(lang.t('manage.schema.copyFailed'));
  }
};

watch(
  () => [props.open, props.indexName, props.connection?.id] as const,
  async ([isOpen]) => {
    if (isOpen) {
      await loadMapping();
      await initEditor();
      await nextTick();
      updateEditorContent();
    }
  },
);

watch(formatted, () => {
  updateEditorContent();
});

watch(themeType, () => {
  const vsTheme = getEditorTheme();
  schemaEditor?.updateOptions({ theme: vsTheme });
});

watch(
  editorConfig,
  () => {
    const options = getEditorOptions();
    schemaEditor?.updateOptions(options);
    schemaEditor?.getModel()?.updateOptions({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
    });
  },
  { deep: true },
);

onUnmounted(() => {
  schemaEditor?.dispose();
  schemaEditor = null;
  editorInitialized = false;
});
</script>

<style scoped>
.schema-index-name {
  margin-left: 0.5rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
}

.schema-loading,
.schema-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 12rem;
}

.schema-error p {
  padding: 1rem;
}

.schema-editor {
  flex: 1;
  min-height: 300px;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  overflow: hidden;
}
</style>
