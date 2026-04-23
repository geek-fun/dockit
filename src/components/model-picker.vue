<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="ghost" :class="triggerClass">
        <span class="truncate text-left">{{ selectedLabel }}</span>
        <span class="i-carbon-chevron-down ml-2 h-4 w-4 shrink-0 opacity-70" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" :class="panelClass">
      <div class="model-picker-panel">
        <div class="model-picker-header">
          <div>
            <p class="model-picker-title">{{ title }}</p>
            <p class="model-picker-subtitle">esc</p>
          </div>
        </div>

        <div class="model-picker-list">
          <div v-if="recentModels.length > 0" class="model-picker-section">
            <p class="model-picker-heading">Recent</p>
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

          <div v-for="group in props.groups" :key="group.id" class="model-picker-section">
            <p class="model-picker-heading">{{ group.label }}</p>
            <button
              v-for="model in group.models"
              :key="model.id"
              class="model-picker-row"
              :class="{ selected: model.id === modelValue }"
              @click="selectModel(model.id)"
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

          <div v-if="props.groups.length === 0" class="model-picker-empty">
            {{ emptyText }}
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
    triggerClass?: string;
    panelClass?: string;
    groups: Array<ModelPickerGroup>;
    modelValue?: string;
    recentModelIds?: Array<string>;
    emptyText?: string;
  }>(),
  {
    title: 'Select model',
    triggerClass: 'h-8 rounded-full px-3 bg-muted/50 hover:bg-muted',
    panelClass: 'w-[360px] p-0 bg-[#151515] text-white border-[#2b2b2b]',
    modelValue: undefined,
    recentModelIds: () => [],
    emptyText: 'No models found.',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  open: [];
}>();

const open = ref(false);

watch(open, value => {
  if (value) emit('open');
});

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
  max-height: 520px;
  flex-direction: column;
}

.model-picker-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 18px 10px;
}

.model-picker-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.model-picker-subtitle {
  margin-top: 4px;
  font-size: 11px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
}

.model-picker-list {
  overflow-y: auto;
  padding: 0 10px 14px;
}

.model-picker-section + .model-picker-section {
  margin-top: 14px;
}

.model-picker-heading {
  padding: 0 8px 8px;
  font-size: 12px;
  font-weight: 700;
  color: #b380ff;
}

.model-picker-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 10px;
  padding: 8px 10px;
  text-align: left;
  color: rgba(255, 255, 255, 0.92);
}

.model-picker-row:hover {
  background: rgba(255, 255, 255, 0.06);
}

.model-picker-row.selected .model-picker-name {
  color: #ffb27c;
}

.model-picker-row.selected .model-picker-checkmark {
  color: #ffb27c;
}

.model-picker-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.model-picker-dot {
  height: 10px;
  width: 10px;
  border-radius: 9999px;
  background: transparent;
}

.model-picker-dot.active {
  background: #ffb27c;
}

.model-picker-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.model-picker-provider,
.model-picker-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.42);
}

.model-picker-empty {
  padding: 18px 10px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.54);
}
</style>
