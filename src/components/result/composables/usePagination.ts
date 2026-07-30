import { computed, ref, type Ref } from 'vue';
import type { PaginationConfig, PaginationMode } from '../types';

export const usePagination = (config: Ref<PaginationConfig | undefined>) => {
  const localPage = ref(1);
  const localPageSize = ref(25);

  const page = computed(() => config.value?.page ?? localPage.value);
  const pageSize = computed(() => config.value?.pageSize ?? localPageSize.value);
  const mode = computed<PaginationMode>(() => config.value?.mode ?? 'client');
  const hasNext = computed(() => config.value?.hasNext ?? false);
  const total = computed(() => config.value?.total);
  const totalPages = computed(() => {
    if (total.value === undefined) return 1;
    return Math.max(1, Math.ceil(total.value / pageSize.value));
  });

  const canGoPrev = computed(() => page.value > 1);
  const canGoNext = computed(() => {
    if (mode.value === 'cursor') return hasNext.value;
    return page.value < totalPages.value;
  });

  const visiblePages = computed(() => {
    if (mode.value !== 'offset' && mode.value !== 'client') return [];
    const total = totalPages.value;
    const current = page.value;
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

  const goToPage = (n: number) => {
    localPage.value = n;
    return n;
  };

  const nextPage = () => {
    if (canGoNext.value) {
      localPage.value++;
      return localPage.value;
    }
    return page.value;
  };

  const prevPage = () => {
    if (canGoPrev.value) {
      localPage.value--;
      return localPage.value;
    }
    return page.value;
  };

  const firstPage = () => {
    localPage.value = 1;
    return 1;
  };

  const setPageSize = (size: number) => {
    localPageSize.value = size;
    localPage.value = 1;
    return 1;
  };

  return {
    page,
    pageSize,
    mode,
    hasNext,
    total,
    totalPages,
    canGoPrev,
    canGoNext,
    visiblePages,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    setPageSize,
  };
};
