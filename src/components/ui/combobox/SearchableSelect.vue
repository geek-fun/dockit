<script setup lang="ts">
import { nextTick, useId } from 'vue';
import type { ComboboxOption } from './types';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

const props = withDefaults(
  defineProps<{
    options: ComboboxOption[];
    modelValue: string;
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    loading?: boolean;
    emptyText?: string;
    allowCreate?: boolean;
    createText?: string;
    searchThreshold?: number;
    variant?: 'outline' | 'ghost';
    class?: string;
  }>(),
  {
    placeholder: 'Select...',
    searchPlaceholder: 'Search...',
    disabled: false,
    loading: false,
    emptyText: 'No results',
    allowCreate: false,
    createText: 'Create',
    searchThreshold: 10,
    variant: 'outline',
    class: undefined,
  },
);

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'open', isOpen: boolean): void;
}>();

const open = ref(false);
const searchQuery = ref('');
const searchInputRef = ref<HTMLInputElement>();
const highlightedIndex = ref(-1);
const listRef = ref<HTMLDivElement>();
const listboxId = useId();

const activeDescendantId = computed(() => {
  if (!open.value || highlightedIndex.value < 0) return undefined;
  const item = navigableItems.value[highlightedIndex.value];
  if (!item) return undefined;
  return item.type === 'create' ? `${listboxId}-create` : `${listboxId}-opt-${item.value}`;
});

const showSearch = computed(
  () => props.options.length > props.searchThreshold || props.allowCreate,
);

const selectedLabel = computed(() => {
  const found = props.options.find(opt => opt.value === props.modelValue);
  if (found) return found.label;
  if (props.allowCreate && props.modelValue) return props.modelValue;
  return undefined;
});

const filteredOptions = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.options;
  }
  const query = searchQuery.value.toLowerCase();
  return props.options.filter(
    opt => opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query),
  );
});

const showCreateNew = computed(() => {
  const trimmed = searchQuery.value.trim();
  if (!props.allowCreate || !trimmed) return false;
  return !props.options.some(opt => opt.value === trimmed || opt.label === trimmed);
});

// All navigable items: filtered options + optional create entry
const navigableItems = computed(() => {
  const items: Array<{ type: 'option'; value: string } | { type: 'create'; value: string }> =
    filteredOptions.value
      .filter(opt => !opt.disabled)
      .map(opt => ({ type: 'option' as const, value: opt.value }));
  if (showCreateNew.value) items.push({ type: 'create', value: searchQuery.value.trim() });
  return items;
});

const selectOption = (value: string) => {
  emits('update:modelValue', value);
  open.value = false;
};

const scrollHighlightedIntoView = async () => {
  await nextTick();
  const list = listRef.value;
  if (!list) return;
  const highlighted = list.querySelector<HTMLElement>('[data-highlighted]');
  highlighted?.scrollIntoView({ block: 'nearest' });
};

const handleKeydown = async (e: KeyboardEvent) => {
  if (!open.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open.value = true;
    }
    return;
  }

  const count = navigableItems.value.length;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = count === 0 ? -1 : (highlightedIndex.value + 1) % count;
    scrollHighlightedIntoView();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = count === 0 ? -1 : (highlightedIndex.value - 1 + count) % count;
    scrollHighlightedIntoView();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (highlightedIndex.value >= 0 && highlightedIndex.value < count) {
      selectOption(navigableItems.value[highlightedIndex.value].value);
    }
  } else if (e.key === 'Escape') {
    open.value = false;
  } else if (e.key === 'Tab') {
    open.value = false;
  }
};

watch(open, async isOpen => {
  if (!isOpen) {
    searchQuery.value = '';
    highlightedIndex.value = -1;
  } else if (showSearch.value) {
    await nextTick();
    searchInputRef.value?.focus();
  }
  emits('open', isOpen);
});

watch(searchQuery, () => {
  highlightedIndex.value = -1;
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        :variant="variant"
        role="combobox"
        :aria-expanded="open"
        :aria-haspopup="'listbox'"
        :aria-controls="listboxId"
        :aria-activedescendant="activeDescendantId"
        :disabled="disabled"
        :class="
          cn(
            'justify-between font-normal focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            props.class,
          )
        "
        @keydown="handleKeydown"
      >
        <slot name="selected-prepend" />
        <template v-if="open && showSearch">
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            :placeholder="searchPlaceholder || placeholder"
            class="flex-1 border-0 outline-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @click.stop
          />
          <span class="i-carbon-search h-4 w-4 ml-2 shrink-0 opacity-50" />
        </template>
        <template v-else>
          <span v-if="selectedLabel" class="truncate">{{ selectedLabel }}</span>
          <span v-else class="text-muted-foreground truncate">{{ placeholder }}</span>
          <span class="i-carbon-chevron-down h-4 w-4 ml-2 shrink-0 opacity-50" />
        </template>
      </Button>
    </PopoverTrigger>

    <PopoverContent :align="'start'" class="w-[--radix-popover-trigger-width] p-1">
      <div :id="listboxId" ref="listRef" role="listbox" class="max-h-[280px] overflow-y-auto p-1">
        <div
          v-if="loading"
          class="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground"
        >
          <Spinner class="h-4 w-4" />
          Loading...
        </div>

        <template v-else>
          <div
            v-for="option in filteredOptions"
            :id="`${listboxId}-opt-${option.value}`"
            :key="option.value"
            role="option"
            :aria-selected="option.value === modelValue"
            :aria-disabled="option.disabled || undefined"
            :data-highlighted="
              navigableItems[highlightedIndex]?.type === 'option' &&
              navigableItems[highlightedIndex]?.value === option.value
                ? ''
                : undefined
            "
            :class="[
              'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
              option.disabled && 'pointer-events-none opacity-50',
              option.value === modelValue && 'bg-accent text-accent-foreground',
              navigableItems[highlightedIndex]?.type === 'option' &&
                navigableItems[highlightedIndex]?.value === option.value &&
                'bg-accent text-accent-foreground',
            ]"
            @click="!option.disabled && selectOption(option.value)"
            @mouseenter="
              highlightedIndex = navigableItems.findIndex(
                item => item.type === 'option' && item.value === option.value,
              )
            "
          >
            <slot name="option" :option="option">
              {{ option.label }}
            </slot>
          </div>

          <div
            v-if="filteredOptions.length === 0 && searchQuery && !showCreateNew"
            class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
          >
            <span class="i-carbon-search h-5 w-5 opacity-40" />
            <span>No results for "{{ searchQuery }}"</span>
          </div>

          <div
            v-if="filteredOptions.length === 0 && !searchQuery"
            class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
          >
            <span class="i-carbon-incomplete h-5 w-5 opacity-40" />
            {{ emptyText }}
          </div>

          <div
            v-if="showCreateNew"
            :id="`${listboxId}-create`"
            role="option"
            :data-highlighted="navigableItems[highlightedIndex]?.type === 'create' ? '' : undefined"
            :class="[
              'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none text-[#18a058] italic hover:bg-accent transition-colors',
              navigableItems[highlightedIndex]?.type === 'create' && 'bg-accent',
            ]"
            @click="selectOption(searchQuery.trim())"
            @mouseenter="highlightedIndex = navigableItems.findIndex(i => i.type === 'create')"
          >
            <span class="i-carbon-add h-4 w-4" />
            {{ createText }}: "{{ searchQuery.trim() }}"
          </div>
        </template>
      </div>
    </PopoverContent>
  </Popover>
</template>
