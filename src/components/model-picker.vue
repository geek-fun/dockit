<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="ghost" :class="triggerClasses">
        <span class="truncate text-left">{{ selectedLabel }}</span>
        <span class="i-carbon-chevron-down ml-1 h-3 w-3 shrink-0 opacity-70" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" :class="panelClasses">
      <div class="model-picker-panel">
        <div class="model-picker-header">
          <div>
            <p class="model-picker-title">{{ title }}</p>
            <p class="model-picker-subtitle">esc</p>
          </div>
        </div>

        <div class="model-picker-search relative mx-2 mb-2">
          <span
            class="i-carbon-search pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50"
          />
          <Input
            ref="searchInputRef"
            v-model="searchQuery"
            role="combobox"
            :aria-expanded="open"
            :aria-activedescendant="activeDescendantId"
            :aria-label="searchAriaLabel"
            :placeholder="t('setting.ai.models.filterModel')"
            class="h-8 pl-7 text-xs"
            @keydown="handleKeydown"
          />
        </div>

        <div class="model-picker-list">
          <div v-if="!isSearching && recentModels.length > 0" class="model-picker-section">
            <p class="model-picker-heading">{{ t('setting.ai.models.recent') }}</p>
            <button
              v-for="model in recentModels"
              :key="`recent-${model.id}`"
              class="model-picker-row"
              :class="{ selected: model.id === modelValue }"
              @click="selectModel(model.id)"
            >
              <div class="model-picker-main">
                <span class="model-picker-dot" :class="{ active: model.id === modelValue }" />
                <span class="model-picker-name">{{ model.label }}</span>
                <span class="model-picker-provider">
                  {{ providerLabel(model.providerConfigId) }}
                </span>
              </div>
              <span
                v-if="model.id === modelValue"
                class="model-picker-checkmark i-carbon-checkmark h-4 w-4 shrink-0"
              />
            </button>
          </div>

          <div
            v-for="(group, groupIndex) in filteredGroups"
            :key="group.id"
            class="model-picker-section"
          >
            <p class="model-picker-heading">{{ group.label }}</p>
            <button
              v-for="(model, modelIndex) in group.models"
              :id="`model-option-${rowIndexFor(groupIndex, modelIndex)}`"
              :key="model.id"
              class="model-picker-row"
              :class="{
                selected: model.id === modelValue,
                active: activeIndex === rowIndexFor(groupIndex, modelIndex),
              }"
              @click="selectModel(model.id)"
              @mouseenter="activeIndex = rowIndexFor(groupIndex, modelIndex)"
            >
              <div class="model-picker-main">
                <span class="model-picker-name">{{ model.label }}</span>
                <span v-if="model.category" class="model-picker-meta">{{ model.category }}</span>
              </div>
              <span
                v-if="model.id === modelValue"
                class="model-picker-checkmark i-carbon-checkmark h-4 w-4 shrink-0"
              />
            </button>
          </div>

          <div v-if="isSearching && filteredModels.length === 0" class="model-picker-empty">
            {{ t('setting.ai.models.noModelMatch') }}
          </div>

          <div v-if="!isSearching && props.groups.length === 0" class="model-picker-empty">
            {{ emptyText }}
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const { t } = useI18n();

type ModelCategory = 'general' | 'reasoning' | 'coding' | 'fast' | 'vision';

type ModelPickerItem = {
  id: string;
  label: string;
  providerConfigId: string;
  category?: ModelCategory;
};

type ModelPickerGroup = {
  id: string;
  label: string;
  models: Array<ModelPickerItem>;
};

const props = withDefaults(
  defineProps<{
    title?: string;
    groups: Array<ModelPickerGroup>;
    modelValue?: string;
    recentModelIds?: Array<string>;
    emptyText?: string;
    compact?: boolean;
  }>(),
  {
    title: 'Select model',
    modelValue: undefined,
    recentModelIds: () => [],
    emptyText: 'No models found.',
    compact: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  open: [];
}>();

const open = ref(false);
const searchQuery = ref('');
const activeIndex = ref(-1);
const searchInputRef = ref<{ $el?: HTMLInputElement } | null>(null);

watch(open, async value => {
  if (value) {
    emit('open');
    await nextTick();
    searchInputRef.value?.$el?.focus();
  } else {
    searchQuery.value = '';
    activeIndex.value = -1;
  }
});

const isSearching = computed(() => searchQuery.value.trim().length > 0);

const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return props.groups;
  return props.groups
    .map(group => ({
      ...group,
      models: group.models.filter(model => {
        const haystack = [model.label, model.category ?? '', group.label].join(' ').toLowerCase();
        return haystack.includes(query);
      }),
    }))
    .filter(group => group.models.length > 0);
});

const filteredModels = computed(() => filteredGroups.value.flatMap(group => group.models));

const groupRowStarts = computed(() => {
  let running = 0;
  return filteredGroups.value.map(group => {
    const start = running;
    running += group.models.length;
    return start;
  });
});

const rowIndexFor = (groupIndex: number, modelIndex: number) =>
  groupRowStarts.value[groupIndex] + modelIndex;

const activeDescendantId = computed(() =>
  activeIndex.value >= 0 ? `model-option-${activeIndex.value}` : undefined,
);

const searchAriaLabel = computed(() => t('setting.ai.models.selectModel') || props.title || '');

const handleKeydown = (e: KeyboardEvent) => {
  const count = filteredModels.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeIndex.value = count === 0 ? -1 : (activeIndex.value + 1) % count;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeIndex.value = count === 0 ? -1 : (activeIndex.value - 1 + count) % count;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeIndex.value >= 0 && activeIndex.value < count) {
      selectModel(filteredModels.value[activeIndex.value].id);
    }
  }
};

watch(searchQuery, () => {
  activeIndex.value = -1;
});

const triggerClasses = computed(() =>
  props.compact
    ? 'h-7 rounded-full px-2 text-xs bg-muted/40 hover:bg-muted/60 min-w-0 flex-1 max-w-[140px]'
    : 'h-8 rounded-full px-3 bg-muted/50 hover:bg-muted min-w-[180px]',
);

const panelClasses = computed(() =>
  props.compact
    ? 'w-[280px] p-0 bg-popover text-foreground border-border'
    : 'w-[360px] p-0 bg-[#151515] text-white border-[#2b2b2b]',
);

const flattenedModels = computed(() => props.groups.flatMap(group => group.models));

const recentModels = computed(() =>
  props.recentModelIds
    .map(id => flattenedModels.value.find(model => model.id === id))
    .filter((model): model is ModelPickerItem => Boolean(model)),
);

const selectedLabel = computed(() => {
  const active = flattenedModels.value.find(model => model.id === props.modelValue);
  if (active) return active.label;
  const recent = recentModels.value[0];
  if (recent) return recent.label;
  return flattenedModels.value[0]?.label ?? 'Select model';
});

const providerLabel = (providerConfigId: string) =>
  props.groups.find(group => group.id === providerConfigId)?.label ?? '';

const selectModel = (value: string) => {
  emit('update:modelValue', value);
  open.value = false;
};
</script>

<style scoped>
.model-picker-panel {
  display: flex;
  max-height: 420px;
  flex-direction: column;
}

.model-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 14px 14px 8px;
}

.model-picker-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.model-picker-subtitle {
  margin-top: 2px;
  font-size: 10px;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground) / 0.6);
}

.model-picker-list {
  overflow-y: auto;
  padding: 0 8px 12px;
}

.model-picker-section + .model-picker-section {
  margin-top: 10px;
}

.model-picker-heading {
  padding: 0 6px 6px;
  font-size: 11px;
  font-weight: 700;
  color: hsl(var(--primary) / 0.8);
}

.model-picker-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 8px;
  padding: 6px 8px;
  text-align: left;
  color: hsl(var(--foreground));
}

.model-picker-row:hover {
  background: hsl(var(--muted) / 0.4);
}

.model-picker-row.active {
  background: hsl(var(--muted) / 0.6);
}

.model-picker-row.selected .model-picker-name {
  color: hsl(var(--primary));
}

.model-picker-row.selected .model-picker-checkmark {
  color: hsl(var(--primary));
}

.model-picker-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.model-picker-dot {
  height: 8px;
  width: 8px;
  border-radius: 9999px;
  background: transparent;
}

.model-picker-dot.active {
  background: hsl(var(--primary));
}

.model-picker-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.model-picker-provider,
.model-picker-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.model-picker-empty {
  padding: 14px 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
