<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[800px] max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>
          {{ $t('manage.schema.title') }}
          <span v-if="indexName" class="schema-index-name">{{ indexName }}</span>
        </DialogTitle>
      </DialogHeader>

      <div v-if="loading" class="schema-loading">
        <Spinner class="mx-auto" />
      </div>

      <template v-else-if="errorMessage">
        <p class="text-destructive text-sm">{{ errorMessage }}</p>
      </template>

      <template v-else>
        <div class="schema-toolbar">
          <Button size="sm" variant="outline" @click="handleCopy">
            <span class="i-carbon-copy h-3.5 w-3.5 mr-1.5" />
            {{ $t('manage.schema.copy') }}
          </Button>
        </div>
        <div class="schema-body macos-scrollable">
          <pre class="schema-pre"><code>{{ formatted }}</code></pre>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CustomError, jsonify } from '@/common';
import { esApi } from '@/datasources';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';
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

const loading = ref(false);
const errorMessage = ref('');
const mapping = ref<unknown>(null);

const formatted = computed(() => {
  if (mapping.value === null || mapping.value === undefined) return '';
  try {
    return jsonify.stringify(mapping.value, null, 2);
  } catch {
    return String(mapping.value);
  }
});

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
  ([isOpen]) => {
    if (isOpen) {
      void loadMapping();
    }
  },
);
</script>

<style scoped>
.schema-index-name {
  margin-left: 0.5rem;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  font-size: 0.875rem;
}

.schema-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.schema-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 12rem;
}

.schema-body {
  flex: 1;
  min-height: 0;
  max-height: 60vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  background: hsl(var(--muted) / 0.35);
}

.schema-pre {
  margin: 0;
  padding: 0.75rem 1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
