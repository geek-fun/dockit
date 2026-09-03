<template>
  <div class="docs-browser-body" :class="{ embedded }">
    <div v-if="indexName" class="docs-search-row">
      <template v-if="enableSearchFilters">
        <Select :model-value="searchColumn" @update:model-value="handleSearchColumnChange">
          <SelectTrigger class="h-8 w-[160px] text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{{ $t('manage.docs.searchAllColumns') }}</SelectItem>
            <SelectItem value="_id">_id</SelectItem>
            <SelectItem v-for="field in searchableFields" :key="field.name" :value="field.name">
              {{ field.name }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-model="searchText"
          class="h-8 text-xs flex-1 min-w-0"
          :placeholder="$t('manage.docs.searchPlaceholder')"
        />
      </template>
      <div v-else class="text-xs text-muted-foreground">
        {{ $t('manage.docs.selectIndexHint') }}
      </div>
      <div class="docs-search-actions">
        <Button
          v-if="enableSearchFilters"
          size="sm"
          variant="default"
          class="h-7"
          :disabled="loading || !indexName"
          @click="reload"
        >
          {{ $t('manage.docs.execute') }}
        </Button>
        <Button
          v-if="enableSearchFilters"
          size="sm"
          variant="outline"
          class="h-7"
          :disabled="loading || !hasActiveFilters"
          @click="clearFilters"
        >
          <span class="i-carbon-filter-remove h-3.5 w-3.5 mr-1" />
          {{ $t('manage.docs.clearFilters') }}
        </Button>
      </div>
    </div>

    <div v-else class="docs-empty">
      <Empty :description="$t('manage.docs.selectIndexHint')" />
    </div>

    <ResultPanel
      v-if="indexName"
      :columns="resultColumns"
      :data="resultData"
      :total="total"
      :loading="loading"
      :loading-overlay="true"
      :error="errorMessage || null"
      :pagination="resultPagination"
      :view-modes="['table', 'tree', 'json']"
      :empty-text="$t('manage.docs.noDocuments')"
      row-key="_id"
      :closable="embedded"
      @refresh="handleRefresh"
      @close="$emit('close')"
      @next-page="goToNextPage"
      @prev-page="goToPrevPage"
      @first-page="goToFirstPage"
      @update:page-size="handleResultPageSize"
    >
      <template #toolbar>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
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
      <template #columnHeader="{ column }">
        <ContextMenu v-if="column.key !== 'actions'">
          <ContextMenuTrigger as-child>
            <div class="th-content">
              <span>{{ column.title }}</span>
              <span v-if="column.dataType" class="column-data-type">{{ column.dataType }}</span>
              <IndexDocsColumnFilter
                v-if="enableSearchFilters && connection && canFilterColumn(column.key)"
                :open="columnFilterOpen === column.key"
                :connection="connection"
                :index-name="indexName"
                :field="column.key"
                :agg-field="resolveAggField(browseFields, column.key)!"
                :selected-values="columnFilters[column.key] ?? []"
                :base-query="queryWithoutColumn(column.key)"
                @update:open="v => (columnFilterOpen = v ? column.key : null)"
                @apply="values => applyColumnFilter(column.key, values)"
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel inset>{{ column.title }}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem
              :disabled="!canFilterColumn(column.key)"
              @select="columnFilterOpen = column.key"
            >
              {{ $t('manage.docs.filterForColumn') }}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div v-else class="th-content">
          <span>{{ column.title }}</span>
          <span v-if="column.dataType" class="column-data-type">{{ column.dataType }}</span>
        </div>
      </template>
      <template #cell="{ column, row }">
        <DropdownMenu v-if="column.key === 'actions' && connection && indexName">
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="h-7 w-7" @click.stop>
              <span class="i-carbon-overflow-menu-horizontal h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-36">
            <DropdownMenuItem :disabled="!getDocumentId(row)" @click="handleEditClick(row)">
              <span class="i-carbon-edit h-3.5 w-3.5 mr-2" />
              {{ lang.t('editor.es.edit') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="handleCloneClick(row)">
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
              :disabled="!getDocumentId(row)"
              class="text-destructive focus:text-destructive"
              @click="handleDeleteClick(row)"
            >
              <span class="i-carbon-trash-can h-3.5 w-3.5 mr-2" />
              {{ lang.t('editor.es.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ContextMenu v-else>
          <ContextMenuTrigger as-child>
            <span
              v-if="isComplexValue(row[column.key])"
              class="json-preview"
              :title="$t('manage.docs.viewJson')"
              @click="handleCellClick(row[column.key])"
            >
              {{ formatCellPreview(row[column.key]) }}
            </span>
            <span v-else class="cell-value">{{ formatScalar(row[column.key]) }}</span>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              :disabled="!canFilterColumn(column.key) || isComplexValue(row[column.key])"
              @select="
                applyColumnFilter(column.key, [row[column.key] as string | number | boolean])
              "
            >
              <span class="i-carbon-filter h-3.5 w-3.5 mr-2" />
              {{ $t('manage.docs.filterForValue') }}
            </ContextMenuItem>
            <ContextMenuItem
              :disabled="!canFilterColumn(column.key) || isComplexValue(row[column.key])"
              @select="addNegativeFilter(column.key, row[column.key] as string | number | boolean)"
            >
              <span class="i-carbon-filter-remove h-3.5 w-3.5 mr-2" />
              {{ $t('manage.docs.excludeValue') }}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              v-if="isComplexValue(row[column.key])"
              @select="handleCellClick(row[column.key])"
            >
              <span class="i-carbon-terminal h-3.5 w-3.5 mr-2" />
              {{ $t('manage.docs.viewJson') }}
            </ContextMenuItem>
            <ContextMenuItem @select="copyCellValue(row[column.key])">
              <span class="i-carbon-copy h-3.5 w-3.5 mr-2" />
              {{ $t('manage.docs.copyValue') }}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </template>
    </ResultPanel>
  </div>

  <JsonValueDialog
    v-model:open="jsonDialogOpen"
    :value="jsonDialogValue"
    :title="jsonDialogTitle"
  />

  <JsonDocumentDialog
    ref="insertDocumentRef"
    v-model:show="showInsertModal"
    :title="lang.t('editor.es.insertDocumentTitle')"
    :initial-value="insertTemplateValue"
    :confirm-text="lang.t('editor.es.insert')"
    @submit="handleInsertSubmit"
  />
  <JsonDocumentDialog
    ref="editDocumentRef"
    v-model:show="showEditModal"
    :title="lang.t('editor.es.editDocumentTitle')"
    :initial-value="editDocumentValue"
    :confirm-text="lang.t('dialogOps.confirm')"
    :strip-fields="['_id']"
    @submit="handleEditSubmit"
  />
  <ConfirmDeleteDialog
    ref="deleteConfirmRef"
    v-model:show="showDeleteModal"
    :confirm-text="lang.t('editor.es.deleteDocumentConfirm')"
    :success-text="lang.t('editor.es.deleteDocumentSuccess')"
    @confirm="handleDeleteConfirm"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Empty } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import JsonValueDialog from '@/components/json-value-dialog.vue';
import IndexDocsColumnFilter from './index-docs-column-filter.vue';
import { ConfirmDeleteDialog, JsonDocumentDialog, ResultPanel } from '@/components/result';
import type { ColumnDef, PaginationConfig } from '@/components/result';
import { CustomError, jsonify } from '@/common';
import {
  esApi,
  buildDocsBrowseQuery,
  extractDocsBrowseFields,
  mergeBrowseFieldsWithHitKeys,
  resolveAggField,
  type DocsBrowseFieldMeta,
  type DocsBrowseColumnFilter,
  type IndexDocumentHit,
} from '@/datasources';
import type { SearchConnection } from '@/store';
import {
  buildInsertTemplateValue,
  extractDocumentId,
} from '@/views/editor/es-editor/utils/es-result';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';
import {
  useResultExport,
  type ResultExportFormat,
} from '@/components/result/composables/useResultExport';

const props = withDefaults(
  defineProps<{
    connection: SearchConnection | undefined;
    indexName: string;
    active?: boolean;
    embedded?: boolean;
    enableSearchFilters?: boolean;
  }>(),
  {
    active: false,
    embedded: false,
    enableSearchFilters: false,
  },
);

defineEmits<{
  close: [];
}>();

const lang = useLang();
const message = useMessageService();
const { copyResult } = useResultExport();

const pageSizeOptions = [25, 50, 100] as const;
const pageSize = ref<(typeof pageSizeOptions)[number]>(25);
const loading = ref(false);
const errorMessage = ref('');
const hits = ref<IndexDocumentHit[]>([]);
const total = ref(0);
const currentPage = ref(1);
const searchAfterStack = ref<Array<unknown[] | undefined>>([undefined]);
const nextSearchAfter = ref<unknown[] | undefined>(undefined);

const mappingFields = ref<DocsBrowseFieldMeta[]>([]);
const searchText = ref('');
const searchColumn = ref('__all__');
const columnFilters = ref<Record<string, Array<string | number | boolean>>>({});
const negativeColumnFilters = ref<Record<string, Array<string | number | boolean>>>({});
const columnFilterOpen = ref<string | null>(null);
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let suppressSearchReload = false;

const jsonDialogOpen = ref(false);
const jsonDialogValue = ref<unknown>(null);
const jsonDialogTitle = ref(lang.t('manage.docs.viewJson'));

const hasNextPage = computed(() => Boolean(nextSearchAfter.value));

const hitKeys = computed(() => {
  const keys = new Set<string>();
  hits.value.forEach(hit => {
    Object.keys(hit._source ?? {}).forEach(key => keys.add(key));
  });
  return Array.from(keys);
});

const browseFields = computed(() =>
  mergeBrowseFieldsWithHitKeys(mappingFields.value, hitKeys.value),
);

const searchableFields = computed(() => browseFields.value.filter(f => f.kind !== 'unsupported'));

const columns = computed(() => ['_id', ...[...hitKeys.value].sort((a, b) => a.localeCompare(b))]);

const activeColumnFilters = computed<DocsBrowseColumnFilter[]>(() =>
  Object.entries(columnFilters.value)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values })),
);

const activeNegativeColumnFilters = computed<DocsBrowseColumnFilter[]>(() =>
  Object.entries(negativeColumnFilters.value)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values })),
);

const hasActiveFilters = computed(
  () =>
    searchText.value.trim().length > 0 ||
    searchColumn.value !== '__all__' ||
    activeColumnFilters.value.length > 0 ||
    activeNegativeColumnFilters.value.length > 0,
);

const activeQuery = computed(() => {
  if (!props.enableSearchFilters) return undefined;
  return buildDocsBrowseQuery({
    text: searchText.value,
    textColumn: searchColumn.value,
    columnFilters: activeColumnFilters.value,
    negativeColumnFilters: activeNegativeColumnFilters.value,
    fields: browseFields.value,
  });
});

const resultColumns = computed<ColumnDef[]>(() => {
  const kindOf = (key: string): string | undefined =>
    browseFields.value.find(f => f.name === key)?.kind;
  const cols: ColumnDef[] = columns.value.map(col => ({
    key: col,
    title: col,
    className: col === '_id' ? 'id-col' : undefined,
    ellipsis: true,
    width: col === '_id' ? 140 : undefined,
    sticky: col === '_id' ? 'left' : undefined,
    dataType: col === '_id' ? 'keyword' : kindOf(col),
  }));
  if (props.connection && props.indexName) {
    cols.push({
      key: 'actions',
      title: lang.t('editor.es.actions'),
      width: 60,
      align: 'center',
      sticky: 'right',
    });
  }
  return cols;
});

const resultData = computed<Record<string, unknown>[]>(() =>
  hits.value.map(hit => ({
    ...hit._source,
    _id: hit._id,
  })),
);

const resultPagination = computed<PaginationConfig>(() => ({
  mode: 'cursor',
  hasNext: hasNextPage.value,
  total: total.value,
  pageSize: pageSize.value,
  pageSizeOptions: [...pageSizeOptions],
}));

const isComplexValue = (value: unknown): boolean => {
  return value !== null && typeof value === 'object';
};

const formatScalar = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const formatCellPreview = (value: unknown): string => {
  try {
    const text = jsonify.stringify(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  } catch {
    return '[object]';
  }
};

const handleCellClick = (value: unknown) => {
  if (!isComplexValue(value)) return;
  jsonDialogValue.value = value;
  jsonDialogTitle.value = lang.t('manage.docs.viewJson');
  jsonDialogOpen.value = true;
};

const canFilterColumn = (col: string): boolean => {
  if (col === '_id') return false;
  const meta = browseFields.value.find(f => f.name === col);
  return Boolean(meta?.aggField);
};

const queryWithoutColumn = (col: string): Record<string, unknown> | undefined =>
  buildDocsBrowseQuery({
    text: searchText.value,
    textColumn: searchColumn.value,
    columnFilters: activeColumnFilters.value.filter(f => f.field !== col),
    negativeColumnFilters: activeNegativeColumnFilters.value.filter(f => f.field !== col),
    fields: browseFields.value,
  });

const applyColumnFilter = (col: string, values: Array<string | number | boolean>) => {
  const next = { ...columnFilters.value };
  if (values.length === 0) {
    delete next[col];
  } else {
    next[col] = values;
    // Remove from negative if present (positive takes precedence)
    if (negativeColumnFilters.value[col]) {
      const negNext = { ...negativeColumnFilters.value };
      delete negNext[col];
      negativeColumnFilters.value = negNext;
    }
  }
  columnFilters.value = next;
  void reload();
};

const addNegativeFilter = (col: string, value: string | number | boolean) => {
  const next = { ...negativeColumnFilters.value };
  const existing = next[col] ?? [];
  if (!existing.includes(value)) {
    next[col] = [...existing, value];
  }
  negativeColumnFilters.value = next;
  // Remove from positive if present (negative takes precedence if both exist)
  if (columnFilters.value[col]?.includes(value)) {
    const posNext = { ...columnFilters.value };
    posNext[col] = posNext[col].filter(v => v !== value);
    if (posNext[col].length === 0) delete posNext[col];
    columnFilters.value = posNext;
  }
  void reload();
};

const copyCellValue = async (value: unknown) => {
  if (!navigator.clipboard) return;
  const text = isComplexValue(value) ? jsonify.stringify(value) : formatScalar(value);
  try {
    await navigator.clipboard.writeText(text);
    message.success(lang.t('manage.docs.filterValueCopied'));
  } catch {
    message.error(lang.t('manage.docs.copyFailed'));
  }
};

// ---- Document CRUD (same interactions as the ES editor result panel) ----

const insertTemplateLoading = ref(false);
const insertTemplateValue = ref<string | undefined>(undefined);
const editDocumentValue = ref('');
const editDocumentId = ref('');
const deletingId = ref('');
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

const getDocumentId = (row: Record<string, unknown>): string | undefined => {
  const id = row._id;
  return id === undefined || id === null ? undefined : String(id);
};

const errMessage = (err: unknown): string =>
  err instanceof CustomError
    ? `status: ${err.status}, details: ${err.details}`
    : ((err as Error)?.message ?? String(err));

const handleInsertClick = async () => {
  if (!props.connection || !props.indexName) return;
  insertTemplateLoading.value = true;
  try {
    const mapping = await esApi
      .getIndexMapping(props.connection, props.indexName)
      .catch(() => undefined);
    const template = buildInsertTemplateValue(mapping, resultData.value[0]);
    insertTemplateValue.value = template ? jsonify.stringify(template, null, 2) : undefined;
  } finally {
    insertTemplateLoading.value = false;
  }
  showInsertModal.value = true;
};

const handleCloneClick = (row: Record<string, unknown>) => {
  const clone = { ...row };
  delete clone._id;
  insertTemplateValue.value = JSON.stringify(clone, null, 2);
  showInsertModal.value = true;
};

const handleCopyRow = (row: Record<string, unknown>, format: ResultExportFormat) => {
  void copyResult(row, format);
};

const handleEditClick = (row: Record<string, unknown>) => {
  editDocumentValue.value = JSON.stringify(row, null, 2);
  editDocumentId.value = getDocumentId(row) ?? '';
  showEditModal.value = true;
};

const handleDeleteClick = (row: Record<string, unknown>) => {
  deletingId.value = getDocumentId(row) ?? '';
  showDeleteModal.value = true;
};

const handleInsertSubmit = async (document: string) => {
  if (!props.connection || !props.indexName) return;
  const { id, body } = extractDocumentId(jsonify.parse(document) as unknown);
  if (id !== undefined && id.trim() === '') {
    insertDocumentRef.value?.setError(lang.t('editor.es.insertIdRequired'));
    return;
  }
  insertDocumentRef.value?.setLoading(true);
  try {
    await esApi.indexDocument(props.connection, {
      index: props.indexName,
      id: id?.trim() || undefined,
      body: jsonify.stringify(body),
    });
    showInsertModal.value = false;
    message.success(lang.t('editor.es.insertSuccess'));
    void reload();
  } catch (err) {
    insertDocumentRef.value?.setError(errMessage(err));
  } finally {
    insertDocumentRef.value?.setLoading(false);
  }
};

const handleEditSubmit = async (document: string) => {
  if (!props.connection || !props.indexName || !editDocumentId.value) return;
  editDocumentRef.value?.setLoading(true);
  try {
    await esApi.indexDocument(props.connection, {
      index: props.indexName,
      id: editDocumentId.value,
      body: document,
    });
    showEditModal.value = false;
    message.success(lang.t('editor.es.updateSuccess'));
    void reload();
  } catch (err) {
    editDocumentRef.value?.setError(errMessage(err));
  } finally {
    editDocumentRef.value?.setLoading(false);
  }
};

const handleDeleteConfirm = async () => {
  if (!props.connection || !props.indexName || !deletingId.value) return;
  deleteConfirmRef.value?.setLoading(true);
  try {
    await esApi.deleteDocument(props.connection, {
      index: props.indexName,
      id: deletingId.value,
    });
    showDeleteModal.value = false;
    message.success(lang.t('editor.es.deleteDocumentSuccess'));
    void reload();
  } catch (err) {
    deleteConfirmRef.value?.setResult('error', errMessage(err));
  } finally {
    deleteConfirmRef.value?.setLoading(false);
  }
};

const handleSearchColumnChange = (value: string) => {
  searchColumn.value = value;
  void reload();
};

const clearFilters = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  suppressSearchReload = true;
  searchText.value = '';
  searchColumn.value = '__all__';
  columnFilters.value = {};
  negativeColumnFilters.value = {};
  columnFilterOpen.value = null;
  suppressSearchReload = false;
  void reload();
};

const handleResultPageSize = (value: number) => {
  if (!pageSizeOptions.includes(value as (typeof pageSizeOptions)[number])) return;
  pageSize.value = value as (typeof pageSizeOptions)[number];
  void reload();
};

const handleRefresh = async () => {
  const start = Date.now();
  currentPage.value = 1;
  searchAfterStack.value = [undefined];
  await fetchPage(undefined, true);
  const elapsed = Date.now() - start;
  if (elapsed < 500) {
    await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
  }
  loading.value = false;
};

const loadMappingFields = async () => {
  if (!props.connection || !props.indexName || !props.enableSearchFilters) {
    mappingFields.value = [];
    return;
  }
  try {
    const mapping = await esApi.getIndexMapping(props.connection, props.indexName);
    mappingFields.value = extractDocsBrowseFields(mapping, props.indexName);
  } catch {
    mappingFields.value = [];
  }
};

const fetchPage = async (searchAfter: unknown[] | undefined, keepLoading = false) => {
  if (!props.connection || !props.indexName) return;

  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await esApi.searchIndexDocuments(props.connection, {
      indexName: props.indexName,
      size: pageSize.value,
      searchAfter,
      query: activeQuery.value,
    });
    hits.value = result.hits;
    total.value = result.total;
    nextSearchAfter.value = result.nextSearchAfter;
  } catch (err) {
    hits.value = [];
    total.value = 0;
    nextSearchAfter.value = undefined;
    errorMessage.value =
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err);
  } finally {
    if (!keepLoading) loading.value = false;
  }
};

const reload = async () => {
  currentPage.value = 1;
  searchAfterStack.value = [undefined];
  await fetchPage(undefined);
};

const goToFirstPage = async () => {
  currentPage.value = 1;
  searchAfterStack.value = [undefined];
  await fetchPage(undefined);
};

const goToPrevPage = async () => {
  if (currentPage.value <= 1) return;
  const nextPage = currentPage.value - 1;
  searchAfterStack.value = searchAfterStack.value.slice(0, nextPage);
  currentPage.value = nextPage;
  await fetchPage(searchAfterStack.value[nextPage - 1]);
};

const goToNextPage = async () => {
  if (!nextSearchAfter.value) return;
  const cursor = nextSearchAfter.value;
  searchAfterStack.value = [...searchAfterStack.value, cursor];
  currentPage.value = currentPage.value + 1;
  await fetchPage(cursor);
};

const resetState = () => {
  hits.value = [];
  total.value = 0;
  currentPage.value = 1;
  searchAfterStack.value = [undefined];
  nextSearchAfter.value = undefined;
  errorMessage.value = '';
  searchText.value = '';
  searchColumn.value = '__all__';
  columnFilters.value = {};
  mappingFields.value = [];
};

watch(
  () => [props.active, props.indexName, props.connection?.id, props.enableSearchFilters] as const,
  async ([isActive, indexName]) => {
    if (isActive && indexName) {
      await loadMappingFields();
      await reload();
    } else {
      resetState();
    }
  },
  { immediate: true },
);

watch(searchText, () => {
  if (suppressSearchReload) return;
  if (!props.enableSearchFilters || !props.active || !props.indexName) return;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    void reload();
  }, 300);
});
</script>

<style scoped>
.docs-browser-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.docs-browser-body.embedded {
  flex: 1;
  height: 100%;
  padding-top: 0.75rem;
}

.docs-search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.docs-search-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.docs-loading,
.docs-empty,
.docs-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 14rem;
  flex: 1;
}

.th-content {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.column-data-type {
  font-size: 10px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.cell-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-preview {
  display: block;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-preview:hover {
  color: hsl(var(--primary));
}
</style>
