<template>
  <div id="es-result-panel">
    <ResultPanel
      v-if="shape === 'docs'"
      :columns="docColumns"
      :data="docRows"
      :view-modes="['table', 'tree', 'json']"
      row-key="_id"
      @refresh="emit('refresh')"
    />
    <JsonView v-else-if="shape === 'json'" :value="resultValue" />
    <pre v-else-if="shape === 'text'" class="es-result-text macos-scrollable">{{
      textContent
    }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { JsonView, ResultPanel } from '@/components/result';
import { buildDocColumns, buildDocRows, resolveEsResultShape } from '../utils/es-result';

const emit = defineEmits<{
  refresh: [];
}>();

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
  width: 100%;
  height: 100%;
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
