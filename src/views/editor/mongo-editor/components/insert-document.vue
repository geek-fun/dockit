<template>
  <Dialog :open="show" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[700px]" :show-close="false">
      <DialogHeader>
        <DialogTitle>
          {{
            props.mode === 'clone'
              ? $t('editor.mongo.cloneDocumentTitle')
              : $t('editor.mongo.insertDocumentTitle')
          }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          @click="handleClose"
        >
          <X class="h-5 w-5" />
        </button>
      </DialogHeader>

      <Alert v-if="errorMessage" variant="destructive" class="mb-2">
        <AlertDescription>{{ errorMessage }}</AlertDescription>
      </Alert>

      <div ref="editorRef" class="document-editor" />

      <DialogFooter>
        <Button variant="outline" :disabled="loading" @click="handleClose">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="loading" @click="handleSubmit">
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{
            props.mode === 'clone' ? $t('editor.mongo.cloneDocument') : $t('editor.mongo.insert')
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { X, Loader2 } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Editor, monaco } from '../../../../common/monaco';
import { useAppStore } from '../../../../store';
import { useLang } from '../../../../lang';

const props = defineProps<{
  show: boolean;
  initialValue?: string;
  mode?: 'insert' | 'clone';
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'submitted'): void;
  (e: 'insert', document: string): void;
}>();

const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType } = storeToRefs(appStore);
const lang = useLang();

const editorRef = ref<HTMLElement>();
const loading = ref(false);
const errorMessage = ref('');
let editorInstance: Editor | null = null;

const initEditor = (retries = 0) => {
  if (!editorRef.value) {
    if (retries < 10) {
      setTimeout(() => initEditor(retries + 1), 30);
    }
    return;
  }
  if (editorInstance) return;
  const options = getEditorOptions();
  editorInstance = monaco.editor.create(editorRef.value, {
    theme: getEditorTheme(),
    value: props.initialValue ?? '{\n  \n}',
    language: 'json',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    ...options,
    minimap: { enabled: false },
    lineNumbers: 'on',
  });
};

const disposeEditor = () => {
  editorInstance?.dispose();
  editorInstance = null;
};

watch(
  () => props.show,
  open => {
    if (open) {
      errorMessage.value = '';
      requestAnimationFrame(() => {
        initEditor();
        if (editorInstance) {
          editorInstance.setValue(props.initialValue ?? '{\n  \n}');
        }
      });
    } else {
      disposeEditor();
    }
  },
);

watch(themeType, () => editorInstance?.updateOptions({ theme: getEditorTheme() }));

onUnmounted(() => disposeEditor());

const handleClose = () => emit('update:show', false);

const handleOpenChange = (open: boolean) => {
  if (!open) handleClose();
};

const handleSubmit = () => {
  const value = editorInstance?.getValue() ?? '';
  errorMessage.value = '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    errorMessage.value = lang.t('editor.mongo.invalidJson');
    return;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errorMessage.value = lang.t('editor.mongo.invalidJsonObject');
    return;
  }
  emit('insert', value);
};

const setLoading = (value: boolean) => {
  loading.value = value;
};

const setError = (msg: string) => {
  errorMessage.value = msg;
};

defineExpose({ setLoading, setError });
</script>

<style scoped>
.document-editor {
  height: 320px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  overflow: hidden;
}
</style>
