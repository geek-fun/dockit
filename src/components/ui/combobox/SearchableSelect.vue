<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'radix-vue';
import type { ComboboxOption } from './types';
import { cn } from '@/lib/utils';
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

const searchTerm = ref('');
const open = ref(false);
const selectedValue = ref(props.modelValue);

const showSearch = computed(
  () => props.options.length > props.searchThreshold || props.allowCreate,
);

const selectedLabel = computed(() => {
  const found = props.options.find(opt => opt.value === props.modelValue);
  if (found) return found.label;
  if (props.allowCreate && props.modelValue) return props.modelValue;
  return undefined;
});

const filteredOptions = computed(() => props.options);

const showCreateNew = computed(() => {
  const trimmed = searchTerm.value.trim().toLowerCase();
  if (!props.allowCreate || !trimmed) return false;
  return !props.options.some(
    opt => opt.value.toLowerCase() === trimmed || opt.label.toLowerCase() === trimmed,
  );
});

const customFilter = (values: string[], term: string) => {
  if (!term.trim()) return values;
  const query = term.toLowerCase();
  return values.filter(value => {
    const opt = props.options.find(o => o.value === value);
    if (!opt) return value === term.trim();
    return opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query);
  });
};

const handleUpdateModelValue = (value: string | number) => {
  emits('update:modelValue', String(value));
  open.value = false;
};

watch(
  () => props.modelValue,
  newValue => {
    selectedValue.value = newValue;
  },
);

watch(open, isOpen => {
  if (!isOpen) {
    searchTerm.value = '';
  }
  emits('open', isOpen);
});
</script>

<template>
  <ComboboxRoot
    v-model="selectedValue"
    v-model:open="open"
    :disabled="disabled"
    :filter-function="customFilter"
    @update:model-value="handleUpdateModelValue"
  >
    <ComboboxAnchor :class="cn('w-full', props.class)">
      <ComboboxTrigger as-child>
        <button
          type="button"
          :class="[
            'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            variant === 'ghost' && 'border-transparent hover:bg-accent',
          ]"
          :disabled="disabled"
        >
          <slot name="selected-prepend" />
          <span v-if="selectedLabel" class="truncate">{{ selectedLabel }}</span>
          <span v-else class="text-muted-foreground truncate">{{ placeholder }}</span>
          <span class="i-carbon-chevron-down h-4 w-4 ml-2 shrink-0 opacity-50" />
        </button>
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxPortal>
      <ComboboxContent
        :class="
          cn(
            'relative z-50 max-h-[280px] w-[--radix-combobox-trigger-width] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            'p-0',
          )
        "
        position="popper"
        :side-offset="4"
      >
        <div v-if="showSearch" class="flex items-center border-b border-border px-3 py-2">
          <ComboboxInput
            v-model="searchTerm"
            :placeholder="searchPlaceholder || placeholder"
            class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <span class="i-carbon-search h-4 w-4 ml-2 shrink-0 opacity-50" />
        </div>

        <ComboboxViewport :class="cn('p-1', !showSearch && 'max-h-[280px] overflow-y-auto')">
          <div
            v-if="loading"
            class="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground"
          >
            <Spinner class="h-4 w-4" />
            Loading...
          </div>

          <template v-else>
            <ComboboxItem
              v-for="option in filteredOptions"
              :key="option.value"
              :value="option.value"
              :disabled="option.disabled"
              :class="
                cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                  'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                  option.value === modelValue && 'bg-accent text-accent-foreground',
                )
              "
            >
              <ComboboxItemIndicator
                class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center"
              >
                <span class="i-carbon-checkmark h-4 w-4" />
              </ComboboxItemIndicator>
              <span class="pl-6">
                <slot name="option" :option="option">
                  {{ option.label }}
                </slot>
              </span>
            </ComboboxItem>

            <ComboboxItem
              v-if="showCreateNew"
              :value="searchTerm.trim()"
              class="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none text-[#18a058] italic data-[highlighted]:bg-accent"
            >
              <span class="i-carbon-add h-4 w-4" />
              {{ createText }}: "{{ searchTerm.trim() }}"
            </ComboboxItem>

            <ComboboxEmpty v-if="!showCreateNew">
              <div
                v-if="searchTerm"
                class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
              >
                <span class="i-carbon-search h-5 w-5 opacity-40" />
                <span>No results for "{{ searchTerm }}"</span>
              </div>
              <div
                v-else
                class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
              >
                <span class="i-carbon-incomplete h-5 w-5 opacity-40" />
                {{ emptyText }}
              </div>
            </ComboboxEmpty>
          </template>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
