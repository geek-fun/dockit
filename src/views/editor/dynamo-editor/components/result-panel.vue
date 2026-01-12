<template>
  <div class="result-panel">
    <n-card v-if="errorMessage" class="error-card" :title="$t('editor.dynamo.partiql.error')">
      <template #header-extra>
        <n-button v-if="closable" text @click="handleClose">
          <template #icon>
            <n-icon><Close /></n-icon>
          </template>
        </n-button>
      </template>
      <n-text type="error">{{ errorMessage }}</n-text>
    </n-card>
    <n-card
      v-else-if="hasData && data.length > 0"
      :title="$t('editor.dynamo.resultTitle')"
      class="result-card"
    >
      <template #header-extra>
        <div class="header-extra">
          <n-text v-if="itemCount !== undefined" depth="3">
            {{ $t('editor.dynamo.partiql.itemsReturned', { count: itemCount }) }}
          </n-text>
          <n-button v-if="closable" text @click="handleClose">
            <template #icon>
              <n-icon><Close /></n-icon>
            </template>
          </n-button>
        </div>
      </template>
      <div class="table-container">
        <n-data-table
          :bordered="false"
          :single-line="false"
          :columns="tableColumnsWithActions"
          :data="data"
          :flex-height="true"
          :scroll-x="tableScrollWidth"
          :loading="loading"
          :pagination="pagination"
          :remote="remote"
          virtual-scroll
          :style="{ height: '100%' }"
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
      <template #footer v-if="hasNextToken">
        <n-button size="small" @click="$emit('load-more')" :loading="loading">
          {{ $t('editor.dynamo.partiql.loadMore') }}
        </n-button>
      </template>
    </n-card>
    <n-card
      v-else-if="hasData && data.length === 0"
      class="success-card"
      :title="$t('editor.dynamo.resultTitle')"
    >
      <template #header-extra>
        <n-button v-if="closable" text @click="handleClose">
          <template #icon>
            <n-icon><Close /></n-icon>
          </template>
        </n-button>
      </template>
      <n-result
        status="success"
        :title="$t('editor.dynamo.partiql.executionSuccess')"
        :description="$t('editor.dynamo.partiql.noItemsReturned')"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { Close, Edit, TrashCan } from '@vicons/carbon';
import { NButton, NIcon } from 'naive-ui';
import type { DataTableColumn, PaginationProps } from 'naive-ui';
import { useLang } from '../../../../lang';

const lang = useLang();

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
  (e: 'delete', row: Record<string, unknown>): void;
}>();

// Action column for edit/delete
const actionColumn = computed<DataTableColumn<Record<string, unknown>>>(() => ({
  title: lang.t('editor.dynamo.actions'),
  key: 'actions',
  width: 100,
  fixed: 'right',
  render(row) {
    return h('div', { style: { display: 'flex', gap: '8px' } }, [
      h(
        NButton,
        {
          size: 'small',
          quaternary: true,
          circle: true,
          onClick: () => emit('edit', row),
        },
        { icon: () => h(NIcon, null, { default: () => h(Edit) }) },
      ),
      h(
        NButton,
        {
          size: 'small',
          quaternary: true,
          circle: true,
          onClick: () => emit('delete', row),
        },
        { icon: () => h(NIcon, null, { default: () => h(TrashCan) }) },
      ),
    ]);
  },
}));

// Combine original columns with action column if needed
const tableColumnsWithActions = computed(() => {
  if (props.showActions && props.columns.length > 0) {
    return [...props.columns, actionColumn.value];
  }
  return props.columns;
});

const tableScrollWidth = computed(() => {
  const columnCount = tableColumnsWithActions.value.length;
  return Math.max(800, columnCount * 150);
});

const handlePageChange = (page: number) => {
  emit('update:page', page);
};

const handlePageSizeChange = (pageSize: number) => {
  emit('update:page-size', pageSize);
};

const handleClose = () => {
  emit('close');
};
</script>

<style lang="scss" scoped>
.result-panel {
  width: 100%;
  height: 100%;
  overflow-y: auto;

  .header-extra {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .result-card {
    width: 100%;
    height: 100%;

    .table-container {
      height: 100%;
      overflow-y: auto;
    }

    :deep(.n-data-table-th__title) {
      white-space: nowrap;
      overflow: hidden;
      min-width: 120px;
      /* Safari fix */
      word-break: keep-all;
    }
  }
}
</style>
