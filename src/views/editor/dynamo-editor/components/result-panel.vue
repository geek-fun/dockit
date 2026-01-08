<template>
  <div class="result-panel">
    <n-card
      v-if="errorMessage"
      class="error-card"
      :title="$t('editor.dynamo.partiql.error')"
    >
      <n-text type="error">{{ errorMessage }}</n-text>
    </n-card>
    <n-card
      v-else-if="hasData && data.length > 0"
      :title="$t('editor.dynamo.resultTitle')"
      class="result-card"
    >
      <template #header-extra>
        <n-text v-if="itemCount !== undefined" depth="3">
          {{ $t('editor.dynamo.partiql.itemsReturned', { count: itemCount }) }}
        </n-text>
      </template>
      <div class="table-container">
        <n-data-table
          :bordered="false"
          :single-line="false"
          :columns="columns"
          :data="data"
          :max-height="maxHeight"
          :scroll-x="scrollX"
          :loading="loading"
          :pagination="pagination"
          :remote="remote"
          virtual-scroll
          @update:page="handlePageChange"
          @update:page-size="handlePageSizeChange"
        />
      </div>
      <template #footer v-if="hasNextToken">
        <n-button
          size="small"
          @click="$emit('load-more')"
          :loading="loading"
        >
          {{ $t('editor.dynamo.partiql.loadMore') }}
        </n-button>
      </template>
    </n-card>
    <n-card
      v-else-if="hasData && data.length === 0"
      class="success-card"
      :title="$t('editor.dynamo.resultTitle')"
    >
      <n-result
        status="success"
        :title="$t('editor.dynamo.partiql.executionSuccess')"
        :description="$t('editor.dynamo.partiql.noItemsReturned')"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import type { DataTableColumn, PaginationProps } from 'naive-ui';

interface Props {
  errorMessage?: string | null;
  hasData?: boolean;
  columns: DataTableColumn[];
  data: Record<string, unknown>[];
  itemCount?: number;
  maxHeight?: number;
  scrollX?: number;
  loading?: boolean;
  hasNextToken?: boolean;
  pagination?: PaginationProps | false;
  remote?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  errorMessage: null,
  hasData: false,
  columns: () => [],
  data: () => [],
  itemCount: undefined,
  maxHeight: 400,
  scrollX: 800,
  loading: false,
  hasNextToken: false,
  pagination: false,
  remote: false,
});

const emit = defineEmits<{
  (e: 'load-more'): void;
  (e: 'update:page', page: number): void;
  (e: 'update:page-size', pageSize: number): void;
}>();

const handlePageChange = (page: number) => {
  emit('update:page', page);
};

const handlePageSizeChange = (pageSize: number) => {
  emit('update:page-size', pageSize);
};
</script>

<style lang="scss" scoped>
.result-panel {
  width: 100%;
  height: 100%;
  overflow: auto;

  .error-card {
    margin: 12px;
  }

  .success-card {
    margin: 12px;
  }

  .result-card {
    margin: 12px;
    height: calc(100% - 24px);

    .table-container {
      height: calc(100% - 60px);
      overflow: auto;
    }

    :deep(.n-data-table-th__title) {
      white-space: nowrap;
    }
  }
}
</style>
