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
    <Card v-else-if="hasData && data.length > 0" class="result-card">
      <CardHeader class="p-3 flex flex-row items-center justify-between">
        <CardTitle class="text-base">{{ $t('editor.dynamo.resultTitle') }}</CardTitle>
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
      </CardHeader>
      <CardContent class="p-0 table-wrapper">
        <div class="table-container">
          <Table>
            <TableHeader class="sticky-header">
              <TableRow>
                <TableHead
                  v-for="col in tableColumnsWithActions"
                  :key="col.key"
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
                <TableCell v-for="col in tableColumnsWithActions" :key="col.key">
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
                    {{ formatCellValue(row[col.key]) }}
                  </template>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <!-- Pagination -->
        <div v-if="pagination && !hasNextToken" class="flex items-center justify-end gap-2 mt-4">
          <span class="text-sm text-muted-foreground">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage <= 1"
            @click="handlePageChange(currentPage - 1)"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="currentPage >= totalPages"
            @click="handlePageChange(currentPage + 1)"
          >
            Next
          </Button>
        </div>
      </CardContent>
      <CardFooter v-if="hasNextToken" class="p-3">
        <Button size="sm" :disabled="loading" @click="$emit('load-more')">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ $t('editor.dynamo.partiql.loadMore') }}
        </Button>
      </CardFooter>
    </Card>
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Empty } from '@/components/ui/empty';
import type { DataTableColumn, PaginationProps } from '@/types';
import { useLang } from '../../../../lang';
import { useTabStore, DynamoDBConnection } from '../../../../store';
import DeleteConfirmModal from './delete-confirm-modal.vue';

const lang = useLang();
const tabStore = useTabStore();

interface Props {
  errorMessage?: string | null;
  hasData?: boolean;
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
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
const currentPage = ref(1);
const pageSize = ref(
  props.pagination && typeof props.pagination === 'object' ? props.pagination.pageSize || 10 : 10,
);

const totalPages = computed(() => Math.ceil(props.data.length / pageSize.value));

const paginatedData = computed(() => {
  if (!props.pagination || props.hasNextToken) {
    return props.data;
  }
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return props.data.slice(start, end);
});

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

// Combine original columns with action column if needed
const tableColumnsWithActions = computed(() => {
  if (props.showActions && props.columns.length > 0) {
    return [...props.columns, actionColumn.value];
  }
  return props.columns;
});

const handlePageChange = (page: number) => {
  currentPage.value = page;
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
}

.header-extra {
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-card,
.error-card,
.success-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.table-wrapper) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.table-container table) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.sticky-header) {
  position: sticky;
  top: 0;
  background-color: hsl(var(--card));
  z-index: 10;
  box-shadow: 0 1px 0 0 hsl(var(--border));
  display: table-header-group;
}

:deep(.table-container tbody) {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  display: block;
}

:deep(.table-container thead),
:deep(.table-container tbody tr) {
  display: table;
  width: 100%;
  table-layout: fixed;
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
