import { computed, ref, watch, type Ref } from 'vue';
import type { PaginationConfig } from '@/components/result';

type PartiqlBatch = { data: readonly unknown[]; nextToken: string | null };
type BatchCursor = { token: string | null; firstPage: number };

const FIRST_BATCH: BatchCursor = { token: null, firstPage: 1 };

export const usePartiqlPagination = (
  result: Ref<PartiqlBatch>,
  loading: Ref<boolean>,
  fetchBatch: (token: string | null) => Promise<boolean>,
) => {
  const pageSize = ref(25);
  const pageInBatch = ref(1);
  const batches = ref<BatchCursor[]>([FIRST_BATCH]);
  const pagesInBatch = computed(() =>
    Math.max(1, Math.ceil(result.value.data.length / pageSize.value)),
  );
  const page = computed(
    () => batches.value[batches.value.length - 1].firstPage + pageInBatch.value - 1,
  );
  const pagination = computed<PaginationConfig>(() => ({
    mode: 'cursor',
    page: page.value,
    pageSize: pageSize.value,
    rowOffset: (pageInBatch.value - 1) * pageSize.value,
    hasNext: pageInBatch.value < pagesInBatch.value || !!result.value.nextToken,
  }));

  watch(pagesInBatch, count => {
    pageInBatch.value = Math.min(pageInBatch.value, count);
  });

  const reset = (): void => {
    batches.value = [FIRST_BATCH];
    pageInBatch.value = 1;
  };

  const navigateBatch = async (
    target: BatchCursor[],
    localPage: 'first' | 'last',
    size = pageSize.value,
  ): Promise<void> => {
    const current = result.value;
    const success = await fetchBatch(target[target.length - 1].token);
    if (!success || current !== result.value) return;
    batches.value = target;
    pageSize.value = size;
    pageInBatch.value = localPage === 'last' ? pagesInBatch.value : 1;
  };

  const nextPage = async (): Promise<void> => {
    if (loading.value) return;
    if (pageInBatch.value < pagesInBatch.value) {
      pageInBatch.value += 1;
      return;
    }

    const token = result.value.nextToken;
    if (token)
      await navigateBatch([...batches.value, { token, firstPage: page.value + 1 }], 'first');
  };

  const previousPage = async (): Promise<void> => {
    if (loading.value) return;
    if (pageInBatch.value > 1) {
      pageInBatch.value -= 1;
    } else if (batches.value.length > 1) {
      await navigateBatch(batches.value.slice(0, -1), 'last');
    }
  };

  const firstPage = async (): Promise<void> => {
    if (loading.value) return;
    if (batches.value.length > 1) {
      await navigateBatch([FIRST_BATCH], 'first');
    } else {
      pageInBatch.value = 1;
    }
  };

  const setPageSize = async (size: number): Promise<void> => {
    if (loading.value || size === pageSize.value) return;
    if (batches.value.length > 1) {
      await navigateBatch([FIRST_BATCH], 'first', size);
    } else {
      pageSize.value = size;
      pageInBatch.value = 1;
    }
  };

  return { pagination, nextPage, previousPage, firstPage, setPageSize, reset };
};
