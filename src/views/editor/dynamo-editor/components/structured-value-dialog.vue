<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[880px]">
      <DialogHeader>
        <DialogTitle>
          {{ $t('editor.dynamo.editStructuredValue') }}
          <span class="text-muted-foreground font-normal">({{ attributeType }})</span>
        </DialogTitle>
      </DialogHeader>

      <div ref="editorRef" class="structured-editor-container" />
      <p v-if="validationError" class="text-sm text-destructive">{{ validationError }}</p>

      <DialogFooter>
        <Button variant="outline" @click="handleOpenChange(false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="!!validationError" @click="handleApply">
          {{ $t('dialogOps.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { monaco, type Editor } from '../../../../common/monaco';
import { useAppStore } from '../../../../store';
import { useLang } from '../../../../lang';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TYPE_VALUE_TEMPLATES } from '../utils/dynamo-attribute';

const props = defineProps<{
  open: boolean;
  attributeType: string;
  value: string | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  apply: [value: string];
}>();

const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const lang = useLang();

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

let editor: Editor | null = null;
const editorRef = ref<HTMLElement>();
const validationError = ref('');

const validate = (text: string): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return lang.t('editor.dynamo.jsonInvalidSyntax', { reason: (error as Error).message });
  }

  const invalidShape = () =>
    lang.t('editor.dynamo.jsonInvalidShape', { type: props.attributeType });

  if (props.attributeType === 'M') {
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? ''
      : invalidShape();
  }

  if (!Array.isArray(parsed)) return invalidShape();
  if (props.attributeType === 'L') return '';
  // DynamoDB forbids empty sets
  if (parsed.length === 0) return lang.t('editor.dynamo.emptySetNotAllowed');

  if (props.attributeType === 'SS') {
    return parsed.every(item => typeof item === 'string') ? '' : invalidShape();
  }
  if (props.attributeType === 'NS') {
    return parsed.every(
      item =>
        typeof item === 'number' ||
        (typeof item === 'string' && item.trim() !== '' && !Number.isNaN(Number(item))),
    )
      ? ''
      : invalidShape();
  }
  return parsed.every(item => typeof item === 'string' && BASE64_PATTERN.test(item.trim()))
    ? ''
    : invalidShape();
};

const setupEditor = () => {
  if (!editorRef.value) return;

  editor = monaco.editor.create(editorRef.value, {
    ...getEditorOptions(),
    theme: getEditorTheme(),
    value: props.value ?? TYPE_VALUE_TEMPLATES[props.attributeType] ?? '',
    language: 'json',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
  });

  validationError.value = validate(editor.getValue());
  editor.onDidChangeModelContent(() => {
    validationError.value = validate(editor?.getValue() ?? '');
  });
};

const disposeEditor = () => {
  editor?.dispose();
  editor = null;
  validationError.value = '';
};

const handleOpenChange = (open: boolean) => {
  emit('update:open', open);
};

const handleApply = () => {
  if (!editor || validationError.value) return;
  emit('apply', JSON.stringify(JSON.parse(editor.getValue())));
  emit('update:open', false);
};

watch(
  () => props.open,
  async open => {
    if (open) {
      await nextTick();
      setupEditor();
    } else {
      disposeEditor();
    }
  },
);

onBeforeUnmount(disposeEditor);
</script>

<style scoped>
.structured-editor-container {
  height: 55vh;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  overflow: hidden;
}
</style>
