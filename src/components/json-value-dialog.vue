<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[720px] max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ title || $t('common.jsonViewer.title') }}</DialogTitle>
      </DialogHeader>

      <div class="json-viewer-toolbar">
        <Button size="sm" variant="outline" @click="handleCopy">
          <span class="i-carbon-copy h-3.5 w-3.5 mr-1.5" />
          {{ $t('common.jsonViewer.copy') }}
        </Button>
      </div>

      <div class="json-viewer-body macos-scrollable">
        <pre class="json-viewer-pre"><code>{{ formatted }}</code></pre>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { jsonify } from '@/common';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';

const props = defineProps<{
  open: boolean;
  value: unknown;
  title?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const lang = useLang();
const message = useMessageService();

const formatted = computed(() => {
  if (props.value === undefined) return '';
  try {
    return jsonify.stringify(props.value, null, 2);
  } catch {
    return String(props.value);
  }
});

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(formatted.value);
    message.success(lang.t('common.jsonViewer.copied'));
  } catch {
    message.error(lang.t('common.jsonViewer.copyFailed'));
  }
};
</script>

<style scoped>
.json-viewer-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.json-viewer-body {
  flex: 1;
  min-height: 0;
  max-height: 60vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  background: hsl(var(--muted) / 0.35);
}

.json-viewer-pre {
  margin: 0;
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
