<template>
  <div class="result-panel">
    <div v-if="error" class="result-error">
      <slot name="error">
        <p class="text-destructive text-sm">{{ error }}</p>
      </slot>
    </div>

    <template v-else>
      <div class="result-header">
        <div class="result-header-left">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 dark:hover:bg-amber-500/20"
                  :disabled="loading"
                  @click="handleCopy('json')"
                >
                  <span class="i-carbon-copy h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('editor.copyJson') }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 dark:hover:bg-sky-500/20"
                  :disabled="loading"
                  @click="handleCopy('csv')"
                >
                  <span class="i-carbon-csv h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('editor.copyCsv') }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                  :disabled="loading"
                  @click="handleExport('json')"
                >
                  <span class="i-carbon-download h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('editor.exportJson') }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 dark:hover:bg-violet-500/20"
                  :disabled="loading"
                  @click="handleExport('csv')"
                >
                  <span class="i-carbon-document-download h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('editor.exportCsv') }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div v-if="$slots.toolbar" class="header-divider" />
          <slot name="toolbar" />
        </div>
        <div class="result-header-right">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  :disabled="loading"
                  @click="$emit('refresh')"
                >
                  <span v-if="loading" class="i-carbon-renew h-3.5 w-3.5 animate-spin" />
                  <span v-else class="i-carbon-renew h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div class="header-divider" />

          <TooltipProvider v-if="viewModes.includes('table')">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7"
                  :class="{ 'text-primary': internalView === 'table' }"
                  @click="switchView('table')"
                >
                  <span class="i-carbon-table h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Table</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider v-if="viewModes.includes('tree')">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7"
                  :class="{ 'text-primary': internalView === 'tree' }"
                  @click="switchView('tree')"
                >
                  <span class="i-carbon-tree-view h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tree</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider v-if="viewModes.includes('json')">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7"
                  :class="{ 'text-primary': internalView === 'json' }"
                  @click="switchView('json')"
                >
                  <span class="i-carbon-code h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>JSON</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div v-if="closable" class="header-divider" />
          <TooltipProvider v-if="closable">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" class="h-7 w-7" @click="$emit('close')">
                  <span class="i-carbon-close h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div v-if="loading && data.length === 0" class="result-loading">
        <Spinner class="mx-auto" />
      </div>

      <div v-else-if="data.length === 0 && !loading" class="result-empty">
        <slot name="empty">
          <Empty :description="emptyText" />
        </slot>
      </div>

      <template v-else>
        <div
          v-if="internalView === 'table'"
          class="table-scroll-area macos-scrollable"
          @wheel="handleTableWheel"
        >
          <div v-if="loading && loadingOverlay" class="result-loading-overlay">
            <Spinner />
          </div>
          <div class="table-container">
            <Table>
              <TableHeader class="sticky-header">
                <TableRow>
                  <TableHead
                    v-for="(col, colIndex) in displayColumns"
                    :key="col.key"
                    :class="[
                      col.className,
                      {
                        'col-sticky-left': col.sticky === 'left',
                        'col-sticky-right': col.sticky === 'right',
                      },
                    ]"
                    :style="{
                      ...colStyle(col),
                      ...stickyLeftStyle(col, colIndex),
                    }"
                  >
                    <slot name="columnHeader" :column="col">{{ col.title }}</slot>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-if="loading" class="result-loading-row">
                  <TableCell :colspan="displayColumns.length" class="text-center py-8">
                    <Spinner class="mx-auto" />
                  </TableCell>
                </TableRow>
                <TableRow
                  v-for="(row, rowIndex) in displayData"
                  v-else
                  :key="getRowKey(row, rowIndex)"
                  :class="rowClassName?.(row, rowIndex)"
                  @click="$emit('row-click', row, rowIndex)"
                >
                  <TableCell
                    v-for="(col, colIndex) in displayColumns"
                    :key="col.key"
                    :class="[
                      col.className,
                      {
                        'col-sticky-left': col.sticky === 'left',
                        'col-sticky-right': col.sticky === 'right',
                      },
                    ]"
                    :style="{
                      textAlign: col.align || 'left',
                      ...stickyLeftStyle(col, colIndex),
                    }"
                  >
                    <div
                      :class="col.ellipsis === false ? undefined : 'cell-truncate'"
                      :title="formatCellValue(row[col.key])"
                    >
                      <slot name="cell" :column="col" :row="row">
                        {{ formatCellValue(row[col.key]) }}
                      </slot>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <div v-if="internalView === 'tree'" class="tree-scroll-area macos-scrollable">
          <TreeNode
            v-for="(item, index) in treeData"
            :key="index"
            :value="item"
            :label="String(index)"
            :depth="0"
          />
        </div>

        <JsonView v-if="internalView === 'json'" :value="props.rawValue ?? displayData" />

        <div v-if="showPagination && !loading" class="result-pagination">
          <div class="pagination-right">
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              <template v-if="props.fetchedCount !== undefined && total !== props.fetchedCount">
                {{ props.fetchedCount }} of {{ total }} documents
              </template>
              <template v-else>{{ total ?? displayData.length }} documents</template>
            </span>

            <div class="pagination-divider" />

            <Select :model-value="String(pageSize)" @update:model-value="handlePageSizeChange">
              <SelectTrigger class="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="size in pageSizeOptions" :key="size" :value="String(size)">
                  {{ size }}
                </SelectItem>
              </SelectContent>
            </Select>

            <div class="flex items-center gap-1">
              <Button
                v-if="isCursor"
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="!canGoPrev"
                @click="handleFirstPage"
              >
                <span class="i-carbon-skip-back h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="!canGoPrev"
                @click="handlePrevPage"
              >
                <span class="i-carbon-chevron-left h-3.5 w-3.5" />
              </Button>
            </div>

            <span class="text-xs text-muted-foreground whitespace-nowrap">
              Page {{ page }}
              <template v-if="hasPages">/{{ totalPages }}</template>
            </span>

            <div class="flex items-center gap-1">
              <template v-if="hasPages">
                <Button
                  v-for="n in visiblePages"
                  :key="n"
                  :variant="n === page ? 'outline' : 'ghost'"
                  size="sm"
                  class="h-7 min-w-[28px] text-xs px-1"
                  :class="{ 'border-primary text-primary': n === page }"
                  @click="handleGoToPage(n)"
                >
                  {{ n }}
                </Button>
              </template>
              <Button
                variant="ghost"
                size="icon"
                class="h-7 w-7"
                :disabled="!canGoNext"
                @click="handleNextPage"
              >
                <span class="i-carbon-chevron-right h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Empty } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import JsonView from './JsonView.vue';
import TreeNode from './TreeNode.vue';
import { usePagination } from './composables/usePagination';
import { useResultExport, type ResultExportFormat } from './composables/useResultExport';
import type { ColumnDef, ViewMode, PaginationConfig } from './types';

const props = withDefaults(
  defineProps<{
    columns?: ColumnDef[];
    data?: Record<string, unknown>[];
    total?: number;
    loading?: boolean;
    error?: string | null;
    pagination?: PaginationConfig;
    viewModes?: ViewMode[];
    activeView?: ViewMode;
    persistViewKey?: string;
    rawValue?: unknown;
    fetchedCount?: number;
    emptyText?: string;
    rowKey?: string | ((row: Record<string, unknown>) => string);
    closable?: boolean;
    loadingOverlay?: boolean;
    rowClassName?: (row: Record<string, unknown>, rowIndex: number) => string | undefined;
  }>(),
  {
    columns: () => [],
    data: () => [],
    total: undefined,
    loading: false,
    error: null,
    pagination: undefined,
    viewModes: () => ['table', 'json'],
    activeView: 'table',
    persistViewKey: undefined,
    rawValue: undefined,
    fetchedCount: undefined,
    emptyText: 'No data',
    rowKey: undefined,
    closable: false,
    loadingOverlay: false,
    rowClassName: undefined,
  },
);

const emit = defineEmits<{
  'update:activeView': [value: ViewMode];
  'update:page': [value: number];
  'update:page-size': [value: number];
  'next-page': [];
  'prev-page': [];
  'first-page': [];
  refresh: [];
  close: [];
  'row-click': [row: Record<string, unknown>, rowIndex: number];
}>();

const getInitialView = (): ViewMode => {
  if (props.persistViewKey) {
    try {
      const saved = localStorage.getItem(props.persistViewKey) as ViewMode | null;
      if (saved && props.viewModes.includes(saved)) return saved;
    } catch {
      // localStorage unavailable — fall through to default
    }
  }
  return props.activeView;
};

const internalView = ref<ViewMode>(getInitialView());

const paginationConfig = computed(() => props.pagination);
const {
  page,
  pageSize,
  mode: paginationMode,
  canGoPrev,
  canGoNext,
  totalPages,
  visiblePages,
  goToPage,
  nextPage,
  prevPage,
  firstPage,
  setPageSize,
} = usePagination(paginationConfig);

const isCursor = computed(() => paginationMode.value === 'cursor');
const hasPages = computed(() => visiblePages.value.length > 0);
const showPagination = computed(() => props.pagination !== undefined);
const pageSizeOptions = computed(() => props.pagination?.pageSizeOptions ?? [25, 50, 100]);

const { copyResult, exportResult } = useResultExport();
const handleCopy = (format: ResultExportFormat) => copyResult(props.rawValue ?? props.data, format);
const handleExport = (format: ResultExportFormat) =>
  exportResult(props.rawValue ?? props.data, format);

const derivedColumns = computed<ColumnDef[]>(() => {
  if (props.columns && props.columns.length > 0) return props.columns;
  const keys = new Set<string>();
  for (const row of props.data) {
    for (const key of Object.keys(row)) keys.add(key);
  }
  return Array.from(keys)
    .sort()
    .map(key => ({ key, title: key }));
});

const displayColumns = computed<ColumnDef[]>(() => derivedColumns.value);

const displayData = computed(() => {
  if (paginationMode.value === 'client' && props.pagination) {
    const start = (page.value - 1) * pageSize.value;
    return props.data.slice(start, start + pageSize.value);
  }
  return props.data;
});

const treeData = computed(() =>
  props.rawValue !== undefined ? [props.rawValue] : displayData.value,
);

const colStyle = (col: ColumnDef) => {
  if (!col.width) return undefined;
  const w = typeof col.width === 'number' ? `${col.width}px` : col.width;
  return { width: w, minWidth: w };
};

// Stacked sticky-left columns: each pins after the accumulated width of the
// sticky columns before it (_id at 0, actions at 140, ...).
const stickyLeftStyle = (col: ColumnDef, columnIndex: number): { left?: string } => {
  if (col.sticky !== 'left') return {};
  let offset = 0;
  for (let i = 0; i < columnIndex; i++) {
    const prev = displayColumns.value[i];
    if (prev?.sticky === 'left') {
      offset += typeof prev.width === 'number' ? prev.width : 140;
    }
  }
  return offset > 0 ? { left: `${offset}px` } : {};
};

const getRowKey = (row: Record<string, unknown>, index: number): string => {
  if (typeof props.rowKey === 'function') return props.rowKey(row);
  if (typeof props.rowKey === 'string') return String(row[props.rowKey] ?? index);
  return String(index);
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const switchView = (view: ViewMode) => {
  internalView.value = view;
  if (props.persistViewKey) {
    try {
      localStorage.setItem(props.persistViewKey, view);
    } catch {
      // ignore persistence failures
    }
  }
  emit('update:activeView', view);
};

const handlePageSizeChange = (value: string) => {
  const size = Number(value);
  const newPage = setPageSize(size);
  emit('update:page-size', size);
  emit('update:page', newPage);
};

/**
 * Wide result tables overflow horizontally while fitting vertically. WebKit
 * does not convert vertical wheel input to horizontal scrolling, so with no
 * vertical overflow the wheel would do nothing — translate it instead.
 */
const handleTableWheel = (event: WheelEvent) => {
  const el = event.currentTarget as HTMLElement;
  if (event.deltaX !== 0) return;
  if (el.scrollHeight > el.clientHeight) return;
  if (el.scrollWidth <= el.clientWidth) return;
  el.scrollLeft += event.deltaY;
  event.preventDefault();
};

const handleGoToPage = (n: number) => {
  goToPage(n);
  emit('update:page', n);
};
const handlePrevPage = () => {
  const n = prevPage();
  emit('prev-page');
  emit('update:page', n);
};
const handleNextPage = () => {
  const n = nextPage();
  emit('next-page');
  emit('update:page', n);
};
const handleFirstPage = () => {
  firstPage();
  emit('first-page');
  emit('update:page', 1);
};

watch(
  () => props.activeView,
  val => {
    internalView.value = val;
  },
);
</script>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.result-error,
.result-loading,
.result-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 8rem;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 0.125rem 0.25rem 0.5rem;
  gap: 0.5rem;
}
.result-header-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.result-header-right {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: auto;
}
.header-divider {
  width: 1px;
  height: 1rem;
  background: hsl(var(--border));
  margin: 0 0.25rem;
}
.table-scroll-area {
  flex: 1;
  min-height: 0;
  /* overflow scroll (not auto) — WebKit (Safari 15 WKWebView) fails to register
     overflow:auto containers as scrollable (#390); scroll forces it. */
  overflow-x: scroll;
  overflow-y: scroll;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  position: relative;
}

.result-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--background) / 0.65);
  backdrop-filter: blur(1px);
}

.table-container :deep(.col-sticky-left) {
  position: sticky;
  left: 0;
  z-index: 5;
  background: hsl(var(--background));
}

.table-container :deep(.col-sticky-right) {
  position: sticky;
  right: 0;
  z-index: 5;
  background: hsl(var(--background));
}

.table-container :deep(.sticky-header) {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--muted));
}

.table-container :deep(.sticky-header .col-sticky-left) {
  z-index: 11;
  background: hsl(var(--muted));
}

.table-container :deep(.sticky-header .col-sticky-right) {
  z-index: 11;
  background: hsl(var(--muted));
}
.table-container {
  min-width: 100%;
}
/* Neutralize Table's wrapper overflow-auto so .table-scroll-area is the scroll container */
.table-container :deep(.relative.w-full.overflow-auto) {
  overflow: visible;
  overflow-x: visible;
  overflow-y: visible;
}
.result-loading-row :deep(td) {
  text-align: center;
}
.cell-truncate {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.tree-scroll-area {
  flex: 1;
  min-height: 0;
  overflow-y: scroll;
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  padding: 0.5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
}

/* Slim scrollbars for the result table/tree — matches the JSON view's Monaco
   scrollbar sizing. Covers both axes: tables scroll horizontally too, and the
   inner Table wrapper can become the scroll container on some layouts. */
.table-scroll-area,
.tree-scroll-area,
.table-scroll-area :deep(.relative.w-full.overflow-auto) {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.table-scroll-area::-webkit-scrollbar,
.tree-scroll-area::-webkit-scrollbar,
.table-scroll-area :deep(.relative.w-full.overflow-auto)::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.table-scroll-area::-webkit-scrollbar-track,
.tree-scroll-area::-webkit-scrollbar-track,
.table-scroll-area :deep(.relative.w-full.overflow-auto)::-webkit-scrollbar-track {
  background: transparent;
}

.table-scroll-area::-webkit-scrollbar-thumb,
.tree-scroll-area::-webkit-scrollbar-thumb,
.table-scroll-area :deep(.relative.w-full.overflow-auto)::-webkit-scrollbar-thumb {
  background-color: hsl(var(--border));
  border-radius: 3px;
}

.table-scroll-area::-webkit-scrollbar-thumb:hover,
.tree-scroll-area::-webkit-scrollbar-thumb:hover,
.table-scroll-area :deep(.relative.w-full.overflow-auto)::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.6);
}
.result-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0.25rem 0;
  flex-shrink: 0;
}
.pagination-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pagination-divider {
  width: 1px;
  height: 1rem;
  background: hsl(var(--border));
}
</style>
