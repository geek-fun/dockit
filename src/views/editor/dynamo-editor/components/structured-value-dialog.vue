<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="w-[calc(100%-2rem)] max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-[800px] motion-reduce:animate-none"
      @open-auto-focus="focusEditor"
      @close-auto-focus="restoreFocus"
    >
      <DialogHeader>
        <DialogTitle>
          {{ $t('editor.dynamo.editStructuredValue') }}
          <span class="text-muted-foreground font-normal">({{ attributeType }})</span>
        </DialogTitle>
      </DialogHeader>

      <div ref="editorRef" class="structured-editor-container" />
      <p v-show="validationError" role="status" class="text-sm text-destructive-text break-words">
        {{ validationError }}
      </p>

      <DialogFooter>
        <Button variant="outline" @click="handleOpenChange(false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button variant="action" :disabled="!!validationError" @click="handleApply">
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
import { TYPE_VALUE_TEMPLATES, validateStructuredValue, type StructuredValueIssue } from '../utils';

const props = defineProps<{
  open: boolean;
  attributeType: string;
  value: string | null;
  returnFocus?: HTMLElement;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  apply: [value: string];
}>();

const appStore = useAppStore();
const { getEditorTheme, getEditorOptions } = appStore;
const lang = useLang();

let editor: Editor | null = null;
let closeAction: { dispose: () => void } | undefined;
const editorRef = ref<HTMLElement>();
const validationError = ref('');

const validationMessage = (issue: StructuredValueIssue | null): string => {
  if (!issue) return '';
  if (issue.kind === 'syntax') {
    return lang.t('editor.dynamo.jsonInvalidSyntax', { reason: issue.reason });
  }
  if (issue.kind === 'emptySet') return lang.t('editor.dynamo.emptySetNotAllowed');
  return lang.t('editor.dynamo.jsonInvalidShape', { type: props.attributeType });
};

const validate = (text: string): string =>
  validationMessage(validateStructuredValue(props.attributeType, text));

const setupEditor = () => {
  if (!editorRef.value) return;

  editor = monaco.editor.create(editorRef.value, {
    ...getEditorOptions(),
    theme: getEditorTheme(),
    value: props.value ?? TYPE_VALUE_TEMPLATES[props.attributeType] ?? '',
    language: 'json',
    ariaLabel: lang.t('editor.dynamo.editStructuredValue'),
    tabFocusMode: true,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
  });

  closeAction = editor.addAction({
    id: 'closeStructuredValue',
    label: lang.t('dialogOps.cancel'),
    keybindings: [monaco.KeyCode.Escape],
    keybindingContext:
      'editorTextFocus && !suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible && !inSnippetMode && !editorHasSelection && !accessibleViewIsShown',
    run: () => handleOpenChange(false),
  });
  validationError.value = validate(editor.getValue());
  editor.onDidChangeModelContent(() => {
    validationError.value = validate(editor?.getValue() ?? '');
  });
};

const disposeEditor = () => {
  closeAction?.dispose();
  closeAction = undefined;
  editor?.dispose();
  editor = null;
  validationError.value = '';
};

const handleOpenChange = (open: boolean) => {
  emit('update:open', open);
};

const handleApply = () => {
  if (!editor || validationError.value) return;
  emit('apply', editor.getValue().trim());
  emit('update:open', false);
};

const focusEditor = async (event: Event) => {
  event.preventDefault();
  await nextTick();
  editor?.focus();
};

const restoreFocus = (event: Event) => {
  if (!props.returnFocus?.isConnected) return;
  event.preventDefault();
  props.returnFocus.focus();
};

watch(
  () => props.open,
  async open => {
    if (open) {
      await nextTick();
      if (props.open) {
        disposeEditor();
        setupEditor();
      }
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
