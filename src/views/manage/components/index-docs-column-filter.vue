<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="h-6 w-6 filter-trigger"
        :class="{ active: selectedValues.length > 0 }"
        :aria-label="$t('manage.docs.columnFilter')"
        @click.stop
      >
        <span class="i-carbon-filter h-3.5 w-3.5" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-2" align="start" @click.stop>
      <div class="filter-panel">
        <Input
          v-model="valueSearch"
          class="h-7 text-xs"
          :placeholder="$t('manage.docs.columnFilterSearch')"
        />

        <div class="filter-actions">
          <label class="select-all">
            <Checkbox
              :checked="allVisibleSelected"
              :disabled="visibleValues.length === 0"
              @update:checked="toggleSelectAll"
            />
            <span>{{ $t('manage.docs.columnFilterSelectAll') }}</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs"
            :disabled="draftSelected.length === 0"
            @click="clearSelection"
          >
            {{ $t('manage.docs.columnFilterClear') }}
          </Button>
        </div>

        <div class="filter-values macos-scrollable">
          <div v-if="loading" class="filter-empty">
            <Spinner class="h-4 w-4" />
            <span>{{ $t('manage.docs.columnFilterLoading') }}</span>
          </div>
          <div v-else-if="errorMessage" class="filter-empty text-destructive">
            {{ errorMessage }}
          </div>
          <div v-else-if="visibleValues.length === 0" class="filter-empty">
            {{ $t('manage.docs.columnFilterNoValues') }}
          </div>
          <label v-for="item in visibleValues" :key="String(item.value)" class="filter-value-row">
            <Checkbox
              :checked="draftSelected.includes(normalizeValue(item.value))"
              @update:checked="checked => toggleValue(item.value, checked)"
            />
            <span class="value-text" :title="formatValue(item.value)">
              {{ formatValue(item.value) }}
            </span>
            <span class="value-count">{{ item.count }}</span>
          </label>
        </div>

        <div class="filter-footer">
          <span v-if="draftSelected.length > 0" class="text-xs text-muted-foreground">
            {{ $t('manage.docs.columnFilterActive', { count: draftSelected.length }) }}
          </span>
          <div class="toolbar-spacer" />
          <Button size="sm" class="h-7" @click="applySelection">
            {{ $t('manage.docs.columnFilterApply') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { CustomError } from '@/common';
import { esApi, type AggregateFieldValue } from '@/datasources';
import type { SearchConnection } from '@/store';

const props = defineProps<{
  connection: SearchConnection;
  indexName: string;
  field: string;
  aggField: string;
  selectedValues: Array<string | number | boolean>;
  baseQuery?: Record<string, unknown>;
}>();

const emit = defineEmits<{
  apply: [values: Array<string | number | boolean>];
}>();

const open = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const valueSearch = ref('');
const values = ref<AggregateFieldValue[]>([]);
const draftSelected = ref<Array<string | number | boolean>>([]);

const normalizeValue = (value: string | number | boolean): string | number | boolean => value;

const formatValue = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const visibleValues = computed(() => {
  const needle = valueSearch.value.trim().toLowerCase();
  if (!needle) return values.value;
  return values.value.filter(item => formatValue(item.value).toLowerCase().includes(needle));
});

const allVisibleSelected = computed(() => {
  if (visibleValues.value.length === 0) return false;
  return visibleValues.value.every(item =>
    draftSelected.value.includes(normalizeValue(item.value)),
  );
});

const loadValues = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    values.value = await esApi.aggregateFieldValues(props.connection, {
      indexName: props.indexName,
      field: props.aggField,
      size: 50,
      query: props.baseQuery,
    });
  } catch (err) {
    values.value = [];
    errorMessage.value =
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
};

const toggleValue = (value: string | number | boolean, checked: boolean) => {
  const normalized = normalizeValue(value);
  if (checked) {
    if (!draftSelected.value.includes(normalized)) {
      draftSelected.value = [...draftSelected.value, normalized];
    }
  } else {
    draftSelected.value = draftSelected.value.filter(item => item !== normalized);
  }
};

const toggleSelectAll = (checked: boolean) => {
  if (checked) {
    const merged = new Set(draftSelected.value);
    visibleValues.value.forEach(item => merged.add(normalizeValue(item.value)));
    draftSelected.value = Array.from(merged);
  } else {
    const visibleSet = new Set(visibleValues.value.map(item => normalizeValue(item.value)));
    draftSelected.value = draftSelected.value.filter(item => !visibleSet.has(item));
  }
};

const clearSelection = () => {
  draftSelected.value = [];
};

const applySelection = () => {
  emit('apply', [...draftSelected.value]);
  open.value = false;
};

watch(open, isOpen => {
  if (isOpen) {
    draftSelected.value = [...props.selectedValues];
    valueSearch.value = '';
    void loadValues();
  }
});
</script>

<style scoped>
.filter-trigger.active {
  color: hsl(var(--primary));
}

.filter-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.filter-values {
  max-height: 200px;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  padding: 0.25rem;
}

.filter-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 4rem;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  text-align: center;
  padding: 0.5rem;
}

.filter-value-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.filter-value-row:hover {
  background: hsl(var(--muted) / 0.5);
}

.value-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value-count {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.filter-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-spacer {
  flex: 1;
}
</style>
