<template>
  <div id="es-result-panel">
    <ResultPanel
      v-if="shape === 'docs'"
      :columns="docColumns"
      :data="docRows"
      :view-modes="['table', 'tree', 'json']"
      active-view="json"
      persist-view-key="es-result-view"
      row-key="_id"
      @refresh="emit('refresh')"
    />
    <template v-else-if="shape === 'json' || shape === 'text'">
      <div class="es-result-actions">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/20"
                @click="handleCopy('json')"
              >
                <span class="i-carbon-copy h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ lang.t('editor.copyJson') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 dark:hover:bg-sky-500/20"
                @click="handleCopy('csv')"
              >
                <span class="i-carbon-csv h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ lang.t('editor.copyCsv') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                @click="handleExport('json')"
              >
                <span class="i-carbon-download h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ lang.t('editor.exportJson') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 dark:hover:bg-violet-500/20"
                @click="handleExport('csv')"
              >
                <span class="i-carbon-document-download h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ lang.t('editor.exportCsv') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <JsonView v-if="shape === 'json'" :value="resultValue" />
      <pre v-else class="es-result-text macos-scrollable">{{ textContent }}</pre>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { JsonView, ResultPanel } from '@/components/result';
import {
  useResultExport,
  type ResultExportFormat,
} from '@/components/result/composables/useResultExport';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLang } from '@/lang';
import { buildDocColumns, buildDocRows, resolveEsResultShape } from '../utils/es-result';

const emit = defineEmits<{
  refresh: [];
}>();

const lang = useLang();
const { copyResult, exportResult } = useResultExport();
const handleCopy = (format: ResultExportFormat) => copyResult(resultState.value?.value, format);
const handleExport = (format: ResultExportFormat) => exportResult(resultState.value?.value, format);

// Keeps the legacy DisplayEditor contract: parent calls display(content, format)
const resultState = ref<{ value: unknown; format?: string } | null>(null);

const display = (value: unknown, format?: string) => {
  resultState.value = { value, format };
};

const dispose = () => {};

defineExpose({ display, dispose });

const resultValue = computed(() => resultState.value?.value);
const shape = computed(() =>
  resultState.value ? resolveEsResultShape(resultState.value.value) : undefined,
);

const searchHits = computed<unknown[]>(() => {
  const value = resultState.value?.value;
  if (typeof value !== 'object' || value === null) return [];
  const hits = (value as Record<string, unknown>)['hits'];
  const list =
    typeof hits === 'object' && hits !== null
      ? (hits as Record<string, unknown>)['hits']
      : undefined;
  return Array.isArray(list) ? list : [];
});

const docRows = computed(() => buildDocRows(searchHits.value));
const docColumns = computed(() => buildDocColumns(searchHits.value));

const textContent = computed(() =>
  typeof resultState.value?.value === 'string' ? resultState.value.value : '',
);
</script>

<style scoped>
#es-result-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.es-result-actions {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.125rem;
  flex-shrink: 0;
  padding: 0.125rem 0.25rem 0.375rem;
}

.es-result-text {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin: 0;
  padding: 0.5rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
}
</style>
