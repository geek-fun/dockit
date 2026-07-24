<template>
  <div class="result-panel">
    <div v-if="error" class="result-error">
      <slot name="error">
        <p class="text-destructive text-sm">{{ error }}</p>
      </slot>
    </div>

    <div v-else-if="loading && data.length === 0" class="result-loading">
      <Spinner class="mx-auto" />
    </div>

    <div v-else-if="data.length === 0 && !loading" class="result-empty">
      <slot name="empty">
        <Empty :description="emptyText" />
      </slot>
    </div>

    <template v-else>
      <div v-if="$slots.toolbar" class="result-toolbar">
        <slot name="toolbar" />
      </div>

      <div class="result-view-tabs">
        <Button
          v-if="viewModes.includes('table')"
          size="sm"
          :variant="internalView === 'table' ? 'default' : 'ghost'"
          @click="switchView('table')"
        >
          Table
        </Button>
        <Button
          v-if="viewModes.includes('tree')"
          size="sm"
          :variant="internalView === 'tree' ? 'default' : 'ghost'"
          @click="switchView('tree')"
        >
          Tree
        </Button>
        <Button
          v-if="viewModes.includes('json')"
          size="sm"
          :variant="internalView === 'json' ? 'default' : 'ghost'"
          @click="switchView('json')"
        >
          JSON
        </Button>
      </div>

      <template v-if="internalView === 'table'">
        <div class="table-scroll-area macos-scrollable">
          <div class="table-container">
            <Table>
              <TableHeader class="sticky-header">
                <TableRow>
                  <TableHead
                    v-for="col in displayColumns"
                    :key="col.key"
                    :class="col.className"
                    :style="colStyle(col)"
                  >
                    {{ col.title }}
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
                >
                  <TableCell
                    v-for="col in displayColumns"
                    :key="col.key"
                    :class="col.className"
                    :style="{ textAlign: col.align || 'left' }"
                  >
                    <slot name="cell" :column="col" :row="row">
                      <span
                        v-if="col.ellipsis"
                        class="cell-ellipsis"
                        :title="formatCellValue(row[col.key])"
                      >
                        {{ formatCellValue(row[col.key]) }}
                      </span>
                      <span v-else>{{ formatCellValue(row[col.key]) }}</span>
                    </slot>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </template>

      <div v-if="internalView === 'tree'" class="tree-scroll-area macos-scrollable">
        <TreeNode
          v-for="(item, index) in displayData"
          :key="index"
          :value="item"
          :label="String(index)"
          :depth="0"
        />
      </div>

      <JsonView v-if="internalView === 'json'" :value="displayData" />

      <div v-if="showPagination && !loading" class="result-pagination">
        <div class="pagination-left">
          <span class="text-xs text-muted-foreground whitespace-nowrap">
            {{ total ?? displayData.length }} documents
          </span>
          <span class="text-xs text-muted-foreground whitespace-nowrap">Page {{ page }}</span>
        </div>
        <div class="pagination-right">
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
import JsonView from './JsonView.vue';
import TreeNode from './TreeNode.vue';
import { usePagination } from './composables/usePagination';
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
    emptyText?: string;
    rowKey?: string | ((row: Record<string, unknown>) => string);
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
    emptyText: 'No data',
    rowKey: undefined,
  },
);

const emit = defineEmits<{
  'update:activeView': [value: ViewMode];
  'update:page': [value: number];
  'update:page-size': [value: number];
  'next-page': [];
  'prev-page': [];
  'first-page': [];
}>();

const internalView = ref<ViewMode>(props.activeView);

const paginationConfig = computed(() => props.pagination);
const {
  page,
  pageSize,
  mode: paginationMode,
  canGoPrev,
  canGoNext,
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

const colStyle = (col: ColumnDef) => {
  if (!col.width) return undefined;
  const w = typeof col.width === 'number' ? `${col.width}px` : col.width;
  return { minWidth: w };
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
  emit('update:activeView', view);
};

const handlePageSizeChange = (value: string) => {
  const size = Number(value);
  const newPage = setPageSize(size);
  emit('update:page-size', size);
  emit('update:page', newPage);
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
.result-toolbar {
  flex-shrink: 0;
}
.result-view-tabs {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
  padding-bottom: 0.5rem;
}
.table-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
}
.table-container {
  min-width: 100%;
}
.table-container :deep(.sticky-header) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: hsl(var(--muted));
}
.result-loading-row :deep(td) {
  text-align: center;
}
.cell-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.tree-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  padding: 0.5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
}
.result-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.5rem;
  flex-shrink: 0;
}
.pagination-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.pagination-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>
