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
      <span class="docs-status text-xs text-muted-foreground">
        <template v-if="indexName">
          {{ $t('manage.docs.totalDocuments', { count: total }) }}
        </template>
        <template v-else>
          {{ $t('manage.docs.selectIndexHint') }}
        </template>
      </span>
      <div class="docs-toolbar-right">
        <Select
          :model-value="String(pageSize)"
          :disabled="!indexName || loading"
          @update:model-value="handlePageSizeChange"
        >
          <SelectTrigger class="h-7 w-[90px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="size in pageSizeOptions" :key="size" :value="String(size)">
              {{ size }}
            </SelectItem>
          </SelectContent>
        </Select>
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

    <div v-else-if="loading && hits.length === 0" class="docs-loading">
      <Spinner class="mx-auto" />
    </div>

    <div v-else-if="errorMessage && hits.length === 0" class="docs-error">
      <p class="text-destructive text-sm">{{ errorMessage }}</p>
    </div>

    <div v-else-if="hits.length === 0" class="docs-empty">
      <Empty :description="$t('manage.docs.noDocuments')" />
    </div>

    <template v-else>
      <div class="docs-table-wrap macos-scrollable" :class="{ 'is-loading': loading }">
        <div v-if="loading" class="docs-table-loader">
          <Spinner />
        </div>
        <table class="docs-table">
          <thead>
            <tr>
              <th v-for="col in columns" :key="col" :class="{ 'id-col': col === '_id' }">
                <div class="th-content">
                  <span>{{ col }}</span>
                  <IndexDocsColumnFilter
                    v-if="enableSearchFilters && connection && canFilterColumn(col)"
                    :connection="connection"
                    :index-name="indexName"
                    :field="col"
                    :agg-field="getAggField(col)!"
                    :selected-values="columnFilters[col] ?? []"
                    :base-query="queryWithoutColumn(col)"
                    @apply="values => applyColumnFilter(col, values)"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="hit in hits" :key="hit._id + String(hit.sort)">
              <td
                v-for="col in columns"
                :key="col"
                :class="{
                  'id-col': col === '_id',
                  'json-cell': isComplexValue(getCellValue(hit, col)),
                }"
                @click="handleCellClick(getCellValue(hit, col))"
              >
                <span
                  v-if="isComplexValue(getCellValue(hit, col))"
                  class="json-preview"
                  :title="$t('manage.docs.viewJson')"
                >
                  {{ formatCellPreview(getCellValue(hit, col)) }}
                </span>
                <span v-else class="cell-value">{{ formatScalar(getCellValue(hit, col)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="docs-pagination">
        <span class="text-xs text-muted-foreground">
          {{ $t('manage.docs.pageInfo', { page: currentPage }) }}
        </span>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            :disabled="currentPage <= 1 || loading"
            @click="goToFirstPage"
          >
            <span class="i-carbon-skip-back h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            :disabled="currentPage <= 1 || loading"
            @click="goToPrevPage"
          >
            <span class="i-carbon-chevron-left h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7"
            :disabled="!hasNextPage || loading"
            @click="goToNextPage"
          >
            <span class="i-carbon-chevron-right h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </template>
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
import { Spinner } from '@/components/ui/spinner';
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
import { CustomError, jsonify } from '@/common';
import {
  esApi,
  buildDocsBrowseQuery,
  extractDocsBrowseFields,
  mergeBrowseFieldsWithHitKeys,
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

const searchableFields = computed(() => browseFields.value);

const columns = computed(() => ['_id', ...[...hitKeys.value].sort((a, b) => a.localeCompare(b))]);

const activeColumnFilters = computed(() =>
  Object.entries(columnFilters.value)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values })),
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

const getCellValue = (hit: IndexDocumentHit, col: string): unknown => {
  if (col === '_id') return hit._id;
  return hit._source?.[col];
};

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

const getAggField = (col: string): string | null => {
  if (col === '_id') return '_id';
  return browseFields.value.find(f => f.name === col)?.aggField ?? null;
};

const canFilterColumn = (col: string): boolean => {
  if (col === '_id') return true;
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

const fetchPage = async (searchAfter: unknown[] | undefined) => {
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
    loading.value = false;
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

const handlePageSizeChange = async (value: string) => {
  const parsed = Number(value);
  if (!pageSizeOptions.includes(parsed as (typeof pageSizeOptions)[number])) return;
  pageSize.value = parsed as (typeof pageSizeOptions)[number];
  await reload();
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
);

watch(searchText, () => {
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

.docs-table-wrap {
  flex: 1;
  min-height: 0;
  max-height: 58vh;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  position: relative;
}

.docs-browser-body.embedded .docs-table-wrap {
  max-height: none;
}

.docs-table-wrap.is-loading {
  overflow: hidden;
  pointer-events: none;
}

.docs-table-loader {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--background) / 0.65);
  backdrop-filter: blur(1px);
}

.docs-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}

.docs-table th,
.docs-table td {
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.4rem 0.65rem;
  text-align: left;
  vertical-align: top;
  max-width: 280px;
}

.docs-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: hsl(var(--muted));
  font-weight: 600;
  white-space: nowrap;
}

.th-content {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.docs-table .id-col {
  position: sticky;
  left: 0;
  z-index: 2;
  background: hsl(var(--background));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  max-width: 180px;
}

.docs-table th.id-col {
  z-index: 3;
  background: hsl(var(--muted));
}

.cell-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.json-cell {
  cursor: pointer;
}

.json-cell:hover .json-preview {
  color: hsl(var(--primary));
}

.json-preview {
  display: block;
  color: hsl(var(--muted-foreground));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  flex-shrink: 0;
}
</style>
