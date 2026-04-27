<script setup lang="ts">
import { nextTick } from 'vue';
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

const selectOption = (value: string) => {
  emits('update:modelValue', value);
  open.value = false;
};

watch(open, async isOpen => {
  if (!isOpen) {
    searchQuery.value = '';
  } else if (showSearch.value) {
    await nextTick();
    searchInputRef.value?.focus();
  }
  emits('open', isOpen);
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        :variant="variant"
        role="combobox"
        :disabled="disabled"
        :class="cn('justify-between font-normal', props.class)"
      >
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
            @keydown.escape="open = false"
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
      <div class="max-h-[280px] overflow-y-auto p-1">
        <div
          v-for="option in filteredOptions"
          :key="option.value"
          :class="[
            'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
            option.disabled && 'pointer-events-none opacity-50',
            option.value === modelValue && 'bg-accent text-accent-foreground',
          ]"
          @click="!option.disabled && selectOption(option.value)"
        >
          <slot name="option" :option="option">
            {{ option.label }}
          </slot>
        </div>

        <div
          v-if="filteredOptions.length === 0 && searchQuery && !allowCreate"
          class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
        >
          <span class="i-carbon-search h-5 w-5 opacity-40" />
          <span>No results for "{{ searchQuery }}"</span>
        </div>

        <div
          v-if="allowCreate && searchQuery && !filteredOptions.length"
          class="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none text-[#18a058] italic hover:bg-accent"
          @click="selectOption(searchQuery)"
        >
          <span class="i-carbon-add h-4 w-4" />
          {{ createText }}: "{{ searchQuery }}"
        </div>
      </div>

      <div
        v-if="filteredOptions.length === 0 && !searchQuery && !loading"
        class="flex flex-col items-center gap-2 px-2 py-8 text-center text-sm text-muted-foreground"
      >
        <span class="i-carbon-incomplete h-5 w-5 opacity-40" />
        {{ emptyText }}
      </div>

      <div
        v-if="loading"
        class="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground"
      >
        <Spinner class="h-4 w-4" />
        Loading...
      </div>
    </PopoverContent>
  </Popover>
</template>
