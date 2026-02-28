<template>
  <div class="result-panel">
    <Card v-if="errorMessage" class="error-card">
      <CardHeader class="p-3 flex flex-row items-center justify-between">
        <CardTitle class="text-base">{{ $t('editor.dynamo.partiql.error') }}</CardTitle>
        <Button v-if="closable" variant="ghost" size="icon" class="close-btn" @click="handleClose">
          <span class="i-carbon-close h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent class="p-3">
        <p class="text-destructive">{{ errorMessage }}</p>
      </CardContent>
    </Card>
    <template v-else-if="hasData && data.length > 0">
      <!-- Header -->
      <div class="result-header">
        <span class="text-base font-semibold">{{ $t('editor.dynamo.resultTitle') }}</span>
        <div class="header-extra">
          <span v-if="itemCount !== undefined" class="text-muted-foreground text-sm">
            {{ $t('editor.dynamo.partiql.itemsReturned', { count: itemCount }) }}
          </span>
          <Button
            v-if="closable"
            variant="ghost"
            size="icon"
            class="close-btn"
            @click="handleClose"
          >
            <span class="i-carbon-close h-4 w-4" />
          </Button>
        </div>
      </div>
      <!-- Scrollable table area -->
      <div class="table-scroll-area">
        <div class="table-container">
          <Table>
            <TableHeader class="sticky-header">
              <TableRow>
                <TableHead
                  v-for="col in tableColumnsWithActions"
                  :key="col.key"
                  :class="{ 'sticky-action-header': col.key === 'actions' }"
                  :style="{ minWidth: col.width ? `${col.width}px` : '120px' }"
                >
                  {{ col.title }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-if="loading">
                <TableCell :colspan="tableColumnsWithActions.length" class="text-center py-8">
                  <Spinner class="mx-auto" />
                </TableCell>
              </TableRow>
              <TableRow v-else-if="data.length === 0">
                <TableCell :colspan="tableColumnsWithActions.length" class="text-center py-8">
                  <Empty :description="$t('editor.dynamo.noData')" />
                </TableCell>
              </TableRow>
              <TableRow v-for="(row, rowIndex) in paginatedData" v-else :key="rowIndex">
                <TableCell
                  v-for="col in tableColumnsWithActions"
                  :key="col.key"
                  :class="{ 'sticky-action-cell': col.key === 'actions' }"
                >
                  <template v-if="col.key === 'actions'">
                    <div class="flex gap-2">
                      <Button size="icon" variant="ghost" @click="$emit('edit', row)">
                        <span class="i-carbon-edit h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" @click="handleDeleteClick(row)">
                        <span class="i-carbon-trash-can h-4 w-4" />
                      </Button>
                    </div>
                  </template>
                  <template v-else>
                    <TooltipProvider :delay-duration="300">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <div class="cell-content">
                            {{ formatCellValue(row[col.key]) }}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {{ formatCellValue(row[col.key]) }}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </template>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
      <!-- Pagination - always pinned at bottom -->
      <div v-if="pagination && !hasNextToken" class="result-pagination">
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          :disabled="currentPage <= 1"
          @click="handlePageChange(currentPage - 1)"
        >
          <span class="i-carbon-chevron-left h-3.5 w-3.5" />
        </Button>
        <Button
          v-for="page in visiblePages"
          :key="page"
          :variant="page === currentPage ? 'outline' : 'ghost'"
          size="icon"
          class="h-6 w-6 text-xs"
          :class="page === currentPage ? 'border-primary text-primary' : ''"
          @click="handlePageChange(page)"
        >
          {{ page }}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          :disabled="currentPage >= totalPages"
          @click="handlePageChange(currentPage + 1)"
        >
          <span class="i-carbon-chevron-right h-3.5 w-3.5" />
        </Button>
        <Select :model-value="String(pageSize)" @update:model-value="handlePageSizeChange">
          <SelectTrigger class="h-6 w-auto min-w-[80px] ml-1.5 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="size in pageSizeOptions" :key="size" :value="String(size)">
              {{ size }} / page
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div v-if="hasNextToken" class="result-pagination">
        <Button size="sm" :disabled="loading" @click="$emit('load-more')">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ $t('editor.dynamo.partiql.loadMore') }}
        </Button>
      </div>
    </template>
    <Card v-else-if="hasData && data.length === 0 && !loading" class="success-card">
      <CardHeader class="p-3 flex flex-row items-center justify-between">
        <CardTitle class="text-base">{{ $t('editor.dynamo.resultTitle') }}</CardTitle>
        <Button v-if="closable" variant="ghost" size="icon" class="close-btn" @click="handleClose">
          <span class="i-carbon-close h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent class="p-3">
        <Empty>
          <template #icon>
            <div class="text-green-500 mb-4">✓</div>
          </template>
          <p class="font-medium">{{ $t('editor.dynamo.partiql.executionSuccess') }}</p>
          <p class="text-muted-foreground text-sm">
            {{ $t('editor.dynamo.partiql.noItemsReturned') }}
          </p>
        </Empty>
      </CardContent>
    </Card>

    <delete-confirm-modal v-model:show="showDeleteModal" :keys="deletingKeys" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Empty } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DataTableColumn, PaginationProps } from '@/types';
import { useLang } from '../../../../lang';
import { useTabStore, DynamoDBConnection } from '../../../../store';
import DeleteConfirmModal from './delete-confirm-modal.vue';

const lang = useLang();
const tabStore = useTabStore();

interface Props {
  errorMessage?: string | null;
  hasData?: boolean;
  columns?: DataTableColumn[];
  data?: Record<string, unknown>[];
  itemCount?: number;
  loading?: boolean;
  hasNextToken?: boolean;
  pagination?: PaginationProps | false;
  remote?: boolean;
  closable?: boolean;
  showActions?: boolean;
  partitionKeyName?: string;
  sortKeyName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  errorMessage: null,
  hasData: false,
  columns: () => [],
  data: () => [],
  itemCount: undefined,
  loading: false,
  hasNextToken: false,
  pagination: false,
  remote: false,
  closable: false,
  showActions: false,
  partitionKeyName: undefined,
  sortKeyName: undefined,
});

const emit = defineEmits<{
  (e: 'load-more'): void;
  (e: 'update:page', page: number): void;
  (e: 'update:page-size', pageSize: number): void;
  (e: 'close'): void;
  (e: 'edit', row: Record<string, unknown>): void;
}>();

// Delete modal state
const showDeleteModal = ref(false);
const deletingKeys = ref<
  Array<{ key: string; value: string | number | boolean | null; type: string }>
>([]);

// Pagination state
const currentPage = computed(() => {
  if (props.remote && props.pagination && typeof props.pagination === 'object') {
    return props.pagination.page || 1;
  }
  return localPage.value;
});
const localPage = ref(1);
const pageSize = computed(() => {
  if (props.remote && props.pagination && typeof props.pagination === 'object') {
    return props.pagination.pageSize || 10;
  }
  return localPageSize.value;
});
const localPageSize = ref(
  props.pagination && typeof props.pagination === 'object' ? props.pagination.pageSize || 10 : 10,
);
const pageSizeOptions = [10, 20, 50, 100];

const totalPages = computed(() => {
  if (props.remote && props.pagination && typeof props.pagination === 'object') {
    return props.pagination.pageCount || 1;
  }
  return Math.max(1, Math.ceil(props.data.length / pageSize.value));
});

const visiblePages = computed(() => {
  const total = totalPages.value;
  const current = currentPage.value;
  const pages: number[] = [];
  const maxVisible = 7;

  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + maxVisible - 1);
    const adjustedStart = Math.max(1, end - maxVisible + 1);
    for (let i = adjustedStart; i <= end; i++) pages.push(i);
  }
  return pages;
});

const paginatedData = computed(() => {
  if (!props.pagination || props.hasNextToken || props.remote) {
    return props.data;
  }
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return props.data.slice(start, end);
});

const handlePageSizeChange = (value: string) => {
  const newSize = Number(value);
  if (!props.remote) {
    localPageSize.value = newSize;
    localPage.value = 1;
  }
  emit('update:page-size', newSize);
  emit('update:page', 1);
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const handleDeleteClick = (row: Record<string, unknown>) => {
  // Get connection and key info dynamically
  const connection = tabStore.activeConnection as DynamoDBConnection | null;
  if (!connection) return;

  const partitionKeyName = connection.partitionKey?.name;
  const partitionKeyType = connection.partitionKey?.valueType;
  const sortKeyName = connection.sortKey?.name;
  const sortKeyType = connection.sortKey?.valueType;

  // Build keys from the row
  const keys: Array<{ key: string; value: string | number | boolean | null; type: string }> = [];

  if (partitionKeyName && row[partitionKeyName] !== undefined) {
    keys.push({
      key: partitionKeyName,
      value: row[partitionKeyName] as string | number | boolean | null,
      type: partitionKeyType || 'S',
    });
  }

  if (sortKeyName && sortKeyType && row[sortKeyName] !== undefined) {
    keys.push({
      key: sortKeyName,
      value: row[sortKeyName] as string | number | boolean | null,
      type: sortKeyType,
    });
  }

  deletingKeys.value = keys;
  showDeleteModal.value = true;
};

// Action column for edit/delete
const actionColumn = computed<DataTableColumn<Record<string, unknown>>>(() => ({
  title: lang.t('editor.dynamo.actions'),
  key: 'actions',
  width: 100,
}));

// Flatten columns that have children (e.g., Primary Key group → partition key + sort key columns)
const flattenedColumns = computed(() => {
  const result: DataTableColumn[] = [];
  for (const col of props.columns) {
    if (col.children && col.children.length > 0) {
      result.push(...col.children);
    } else {
      result.push(col);
    }
  }
  return result;
});

// Combine original columns with action column if needed
const tableColumnsWithActions = computed(() => {
  if (props.showActions && flattenedColumns.value.length > 0) {
    return [...flattenedColumns.value, actionColumn.value];
  }
  return flattenedColumns.value;
});

const handlePageChange = (page: number) => {
  if (page < 1 || page > totalPages.value) return;
  if (!props.remote) {
    localPage.value = page;
  }
  emit('update:page', page);
};

const handleClose = () => {
  emit('close');
};
</script>

<style scoped>
.result-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  flex-shrink: 0;
}

.header-extra {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-scroll-area {
  flex: 1 1 0;
  overflow: auto;
  border-top: 1px solid hsl(var(--border));
}

.result-pagination {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding: 4px 8px;
  border-top: 1px solid hsl(var(--border));
  font-size: 12px;
}

.error-card,
.success-card {
  width: 100%;
}

.table-container {
  min-width: 100%;
}

/* Override Table component's inner overflow-auto wrapper so sticky header works
   within .table-scroll-area as the scroll container */
:deep(.table-container > .relative) {
  overflow: visible !important;
}

:deep(.table-container table) {
  width: 100%;
  min-width: max-content;
  table-layout: auto;
}

:deep(.table-container thead) {
  display: table-header-group;
}

:deep(.sticky-header) {
  position: sticky;
  top: 0;
  background-color: hsl(var(--card));
  z-index: 10;
  box-shadow: 0 1px 0 0 hsl(var(--border));
}

:deep(.table-container tbody) {
  display: table-row-group;
}

:deep(.table-container thead tr),
:deep(.table-container tbody tr) {
  display: table-row;
}

:deep(.table-container thead th) {
  white-space: nowrap;
  padding: 6px 8px;
}

:deep(.sticky-action-header) {
  position: sticky !important;
  right: 0;
  background-color: hsl(var(--card));
  z-index: 11;
  box-shadow: -1px 0 0 0 hsl(var(--border));
}

:deep(.sticky-action-cell) {
  position: sticky !important;
  right: 0;
  background-color: hsl(var(--card));
  z-index: 5;
  box-shadow: -1px 0 0 0 hsl(var(--border));
}

:deep(.table-container tbody td) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.cell-content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  display: block;
}

.close-btn {
  background: transparent;
  border: none;
}

.close-btn:hover {
  background: transparent;
  opacity: 0.8;
}
</style>
