<template>
  <div class="docs-browser-body" :class="{ embedded }">
    <div v-if="enableSearchFilters && indexName" class="docs-search-row">
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
        class="h-8 text-xs"
        :placeholder="$t('manage.docs.searchPlaceholder')"
      />
    </div>

    <div class="docs-toolbar">
      <div v-if="!indexName" class="text-xs text-muted-foreground">
        {{ $t('manage.docs.selectIndexHint') }}
      </div>
      <div class="docs-toolbar-right">
        <Button
          v-if="enableSearchFilters"
          size="sm"
          variant="outline"
          class="h-7"
          :disabled="loading || !indexName || !hasActiveFilters"
          @click="clearFilters"
        >
          <span class="i-carbon-filter-remove h-3.5 w-3.5 mr-1" />
          {{ $t('manage.docs.clearFilters') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="h-7"
          :disabled="loading || !indexName"
          @click="reload"
        >
          <span class="i-carbon-renew h-3.5 w-3.5 mr-1" />
          {{ $t('manage.docs.refresh') }}
        </Button>
      </div>
    </div>

    <div v-if="!indexName" class="docs-empty">
      <Empty :description="$t('manage.docs.selectIndexHint')" />
    </div>

    <ResultPanel
      v-else
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
      <template #columnHeader="{ column }">
        <div class="th-content">
          <span>{{ column.title }}</span>
          <IndexDocsColumnFilter
            v-if="enableSearchFilters && connection && canFilterColumn(column.key)"
            :connection="connection"
            :index-name="indexName"
            :field="column.key"
            :agg-field="resolveAggField(browseFields, column.key)!"
            :selected-values="columnFilters[column.key] ?? []"
            :base-query="queryWithoutColumn(column.key)"
            @apply="values => applyColumnFilter(column.key, values)"
          />
        </div>
      </template>
      <template #cell="{ column, row }">
        <span
          v-if="isComplexValue(row[column.key])"
          class="json-preview"
          :title="$t('manage.docs.viewJson')"
          @click="handleCellClick(row[column.key])"
        >
          {{ formatCellPreview(row[column.key]) }}
        </span>
        <span v-else class="cell-value">{{ formatScalar(row[column.key]) }}</span>
      </template>
    </ResultPanel>
  </div>

  <JsonValueDialog
    v-model:open="jsonDialogOpen"
    :value="jsonDialogValue"
    :title="jsonDialogTitle"
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
import JsonValueDialog from '@/components/json-value-dialog.vue';
import IndexDocsColumnFilter from './index-docs-column-filter.vue';
import { ResultPanel } from '@/components/result';
import type { ColumnDef, PaginationConfig } from '@/components/result';
import { CustomError, jsonify } from '@/common';
import {
  esApi,
  buildDocsBrowseQuery,
  extractDocsBrowseFields,
  mergeBrowseFieldsWithHitKeys,
  resolveAggField,
  type DocsBrowseFieldMeta,
  type IndexDocumentHit,
} from '@/datasources';
import type { SearchConnection } from '@/store';
import { useLang } from '@/lang';

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

const lang = useLang();

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

const activeColumnFilters = computed(() =>
  Object.entries(columnFilters.value)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values })),
);

const hasActiveFilters = computed(
  () =>
    searchText.value.trim().length > 0 ||
    searchColumn.value !== '__all__' ||
    activeColumnFilters.value.length > 0,
);

const activeQuery = computed(() => {
  if (!props.enableSearchFilters) return undefined;
  return buildDocsBrowseQuery({
    text: searchText.value,
    textColumn: searchColumn.value,
    columnFilters: activeColumnFilters.value,
    fields: browseFields.value,
  });
});

const resultColumns = computed<ColumnDef[]>(() =>
  columns.value.map(col => ({
    key: col,
    title: col,
    className: col === '_id' ? 'id-col' : undefined,
    ellipsis: col !== '_id',
    sticky: col === '_id' ? 'left' : undefined,
  })),
);

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
    columnFilters: activeColumnFilters.value.filter(filter => filter.field !== col),
    fields: browseFields.value,
  });

const applyColumnFilter = (col: string, values: Array<string | number | boolean>) => {
  const next = { ...columnFilters.value };
  if (values.length === 0) {
    delete next[col];
  } else {
    next[col] = values;
  }
  columnFilters.value = next;
  void reload();
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
}

.docs-search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.docs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

.docs-toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
