<template>
  <div id="es-result-panel">
    <ResultPanel
      v-if="shape === 'docs'"
      :columns="displayColumns"
      :data="docRows"
      :raw-value="resultValue"
      :meta-summary="responseSummary"
      :total="hitsTotal ?? docRows.length"
      :fetched-count="docRows.length"
      :loading="loading"
      :pagination="{
        mode: 'client',
        total: docRows.length,
        pageSize: 25,
        pageSizeOptions: [25, 50, 100, 200],
      }"
      :view-modes="['table', 'tree', 'json']"
      active-view="json"
      persist-view-key="es-result-view"
      row-key="_id"
      @refresh="emit('refresh')"
    >
      <template #toolbar>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                v-if="index && connection"
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="insertTemplateLoading"
                @click="handleInsertClick"
              >
                <span
                  v-if="insertTemplateLoading"
                  class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin"
                />
                <span v-else class="i-carbon-add h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ lang.t('editor.es.insertDocument') }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </template>
      <template #cell="{ column, row }">
        <template v-if="column.key === 'actions' && connection">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop>
                <span class="i-carbon-overflow-menu-horizontal h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-36">
              <DropdownMenuItem
                :disabled="!getDocumentId(row) || !rowTargetIndex(row)"
                @click="handleEditClick(row)"
              >
                <span class="i-carbon-edit h-3.5 w-3.5 mr-2" />
                {{ lang.t('editor.es.edit') }}
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="!rowTargetIndex(row)" @click="handleCloneClick(row)">
                <span class="i-carbon-copy h-3.5 w-3.5 mr-2" />
                {{ lang.t('editor.es.clone') }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleCopyRow(row, 'json')">
                <span class="i-carbon-json h-3.5 w-3.5 mr-2" />
                {{ lang.t('editor.copyJson') }}
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleCopyRow(row, 'csv')">
                <span class="i-carbon-csv h-3.5 w-3.5 mr-2" />
                {{ lang.t('editor.copyCsv') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                :disabled="!getDocumentId(row) || !rowTargetIndex(row)"
                class="text-destructive focus:text-destructive"
                @click="handleDeleteClick(row)"
              >
                <span class="i-carbon-trash-can h-3.5 w-3.5 mr-2" />
                {{ lang.t('editor.es.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
        <span v-else class="cell-value">{{ formatCellValue(row[column.key]) }}</span>
      </template>
    </ResultPanel>
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
        <div class="header-divider" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="loading"
                @click="emit('refresh')"
              >
                <span v-if="loading" class="i-carbon-renew h-3.5 w-3.5 animate-spin" />
                <span v-else class="i-carbon-renew h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <JsonView
        v-if="shape === 'json' || format === 'yaml'"
        :value="resultValue"
        :language="format === 'yaml' ? 'yaml' : 'json'"
      />
      <pre v-else class="es-result-text macos-scrollable">{{ textContent }}</pre>
    </template>

    <JsonDocumentDialog
      ref="insertDocumentRef"
      v-model:show="showInsertModal"
      :title="lang.t('editor.es.insertDocumentTitle')"
      :initial-value="cloneDocumentValue"
      :hint="lang.t('editor.es.insertIdHint')"
      :confirm-text="lang.t('editor.es.insert')"
      @submit="handleInsertSubmit"
    />
    <JsonDocumentDialog
      ref="editDocumentRef"
      v-model:show="showEditModal"
      :title="lang.t('editor.es.editDocumentTitle')"
      :initial-value="editDocumentValue"
      :confirm-text="lang.t('dialogOps.confirm')"
      :strip-fields="['_id', '_index']"
      @submit="handleEditSubmit"
    />
    <ConfirmDeleteDialog
      ref="deleteConfirmRef"
      v-model:show="showDeleteModal"
      :confirm-text="lang.t('editor.es.deleteDocumentConfirm')"
      :success-text="lang.t('editor.es.deleteDocumentSuccess')"
      @confirm="handleDeleteConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { esApi } from '@/datasources';
import { CustomError, jsonify } from '@/common';
import {
  JsonView,
  ResultPanel,
  JsonDocumentDialog,
  ConfirmDeleteDialog,
} from '@/components/result';
import {
  useResultExport,
  type ResultExportFormat,
} from '@/components/result/composables/useResultExport';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';
import type { SearchConnection } from '@/store';
import {
  buildDocColumns,
  buildDocRows,
  buildInsertTemplateValue,
  buildResponseSummary,
  collectResultIndices,
  extractDocumentId,
  extractHitsTotal,
  mergeMappingFieldTypes,
  resolveEsResultShape,
} from '../utils/es-result';

const props = withDefaults(
  defineProps<{
    connection?: SearchConnection;
    index?: string;
    loading?: boolean;
  }>(),
  {
    connection: undefined,
    index: undefined,
    loading: false,
  },
);

const emit = defineEmits<{
  refresh: [];
}>();

const lang = useLang();
const message = useMessageService();
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
const hitsTotal = computed(() => {
  const value = resultValue.value;
  if (!value || typeof value !== 'object') return undefined;
  return extractHitsTotal((value as Record<string, unknown>)['hits']);
});
const format = computed(() => resultState.value?.format);
const shape = computed(() =>
  resultState.value ? resolveEsResultShape(resultState.value.value) : undefined,
);

const responseSummary = computed(() =>
  shape.value === 'docs' ? buildResponseSummary(resultValue.value) : undefined,
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
const fieldTypes = ref<Record<string, string>>({});

// Indices whose mapping request failed (e.g. 403) — skip repeat requests for
// the rest of the session instead of hammering a denied endpoint per query.
const mappingDeniedIndices = new Set<string>();

const fetchMappingSafe = async (index: string): Promise<unknown | undefined> => {
  if (!props.connection || mappingDeniedIndices.has(index)) return undefined;
  try {
    const mapping: unknown = await esApi.getIndexMapping(props.connection, index);
    const errBody = mapping as { status?: number } | undefined | null;
    if (errBody && typeof errBody.status === 'number' && errBody.status >= 400) {
      mappingDeniedIndices.add(index);
      return undefined;
    }
    mappingDeniedIndices.delete(index);
    return mapping;
  } catch {
    mappingDeniedIndices.add(index);
    return undefined;
  }
};

watch(
  [resultValue, searchHits],
  async () => {
    fieldTypes.value = {};
    if (shape.value !== 'docs' || !props.connection) return;
    const indices = collectResultIndices(searchHits.value);
    if (indices.length === 0) return;
    const mapping = await fetchMappingSafe(indices.join(','));
    if (!mapping) return;
    fieldTypes.value = mergeMappingFieldTypes(mapping);
  },
  { immediate: true },
);

const displayColumns = computed(() =>
  buildDocColumns(
    searchHits.value,
    Boolean(props.connection),
    lang.t('editor.es.actions'),
    fieldTypes.value,
  ),
);

const textContent = computed(() =>
  typeof resultState.value?.value === 'string' ? resultState.value.value : '',
);

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getDocumentId = (row: Record<string, unknown>): string | undefined => {
  const id = row._id;
  return id === undefined || id === null ? undefined : String(id);
};

// Write target for a row action: the hit's own `_index` — always the accurate
// target (cluster-wide searches return hits from many indices). A row without
// one cannot be written to, so the row actions disable themselves.
const rowTargetIndex = (row: Record<string, unknown>): string | undefined => {
  const idx = row._index;
  return typeof idx === 'string' && idx !== '' ? idx : undefined;
};

const editDocumentValue = ref('');
const editDocumentId = ref('');
const deletingId = ref('');
const targetIndex = ref<string | undefined>(undefined);
const showInsertModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);

type DialogExposed = { setLoading: (v: boolean) => void; setError: (msg: string) => void };
type DeleteExposed = {
  setLoading: (v: boolean) => void;
  setResult: (type: 'success' | 'error', msg: string) => void;
};
const insertDocumentRef = ref<DialogExposed>();
const editDocumentRef = ref<DialogExposed>();
const deleteConfirmRef = ref<DeleteExposed>();

const insertTemplateLoading = ref(false);

const buildInsertTemplate = async (): Promise<string | undefined> => {
  if (!props.connection || !props.index) return undefined;
  const mapping = await fetchMappingSafe(props.index);
  const raw = buildInsertTemplateValue(mapping, docRows.value[0]);
  if (!raw) return undefined;
  // Prefill the sample id from the first listed doc so users see what an _id
  // looks like; submitting it unchanged is blocked in handleInsertSubmit.
  const template =
    raw['_id'] === undefined && sampleSourceId.value !== undefined
      ? { _id: sampleSourceId.value, ...raw }
      : raw;
  return jsonify.stringify(template, null, 2);
};

const cloneDocumentValue = ref<string | undefined>(undefined);
const sampleSourceId = ref<string | undefined>(undefined);

const handleInsertClick = async () => {
  targetIndex.value = props.index;
  sampleSourceId.value = docRows.value[0]
    ? (getDocumentId(docRows.value[0]) ?? undefined)
    : undefined;
  insertTemplateLoading.value = true;
  try {
    cloneDocumentValue.value = await buildInsertTemplate();
  } finally {
    insertTemplateLoading.value = false;
  }
  showInsertModal.value = true;
};

const handleCloneClick = (row: Record<string, unknown>) => {
  const clone = { ...row };
  delete clone._index;
  cloneDocumentValue.value = JSON.stringify(clone, null, 2);
  sampleSourceId.value = getDocumentId(row);
  targetIndex.value = rowTargetIndex(row);
  showInsertModal.value = true;
};

const handleCopyRow = (row: Record<string, unknown>, format: ResultExportFormat) => {
  void copyResult(row, format);
};

const handleEditClick = (row: Record<string, unknown>) => {
  editDocumentValue.value = JSON.stringify(row, null, 2);
  editDocumentId.value = getDocumentId(row) ?? '';
  targetIndex.value = rowTargetIndex(row);
  showEditModal.value = true;
};

const handleDeleteClick = (row: Record<string, unknown>) => {
  deletingId.value = getDocumentId(row) ?? '';
  targetIndex.value = rowTargetIndex(row);
  showDeleteModal.value = true;
};

const handleInsertSubmit = async (document: string) => {
  if (!props.connection || !targetIndex.value) return;
  const { id, body } = extractDocumentId(jsonify.parse(document) as unknown);
  if (id !== undefined && id.trim() === '') {
    insertDocumentRef.value?.setError(lang.t('editor.es.insertIdRequired'));
    return;
  }
  if (id !== undefined && id === sampleSourceId.value) {
    insertDocumentRef.value?.setError(lang.t('editor.es.insertIdExists'));
    return;
  }
  insertDocumentRef.value?.setLoading(true);
  try {
    await esApi.indexDocument(props.connection, {
      index: targetIndex.value,
      id: id || undefined,
      body: jsonify.stringify(body),
    });
    showInsertModal.value = false;
    message.success(lang.t('editor.es.insertSuccess'));
    emit('refresh');
  } catch (err) {
    insertDocumentRef.value?.setError(errMessage(err));
  } finally {
    insertDocumentRef.value?.setLoading(false);
  }
};

const handleEditSubmit = async (document: string) => {
  if (!props.connection || !targetIndex.value || !editDocumentId.value) return;
  editDocumentRef.value?.setLoading(true);
  try {
    await esApi.indexDocument(props.connection, {
      index: targetIndex.value,
      id: editDocumentId.value,
      body: document,
    });
    showEditModal.value = false;
    message.success(lang.t('editor.es.updateSuccess'));
    emit('refresh');
  } catch (err) {
    editDocumentRef.value?.setError(errMessage(err));
  } finally {
    editDocumentRef.value?.setLoading(false);
  }
};

const handleDeleteConfirm = async () => {
  if (!props.connection || !targetIndex.value || !deletingId.value) return;
  deleteConfirmRef.value?.setLoading(true);
  try {
    await esApi.deleteDocument(props.connection, {
      index: targetIndex.value,
      id: deletingId.value,
    });
    showDeleteModal.value = false;
    message.success(lang.t('editor.es.deleteDocumentSuccess'));
    emit('refresh');
  } catch (err) {
    deleteConfirmRef.value?.setResult('error', errMessage(err));
  } finally {
    deleteConfirmRef.value?.setLoading(false);
  }
};

const errMessage = (err: unknown): string =>
  err instanceof CustomError
    ? `status: ${err.status}, details: ${err.details}`
    : ((err as Error)?.message ?? String(err));
</script>

<style scoped>
#es-result-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
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

.es-result-actions .header-divider {
  width: 1px;
  height: 1rem;
  background: hsl(var(--border));
  margin: 0 0.25rem;
}

.es-result-text {
  flex: 1;
  min-height: 0;
  overflow-y: scroll;
  overflow-x: auto;
  margin: 0;
  padding: 0.5rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  white-space: pre-wrap;
}
</style>
