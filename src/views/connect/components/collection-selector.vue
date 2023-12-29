<template>
  <div class="collection-selector-container">
    <n-select
      :options="options"
      placeholder="No collection/index selected"
      @update:value="handleUpdateValue"
    />
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '../../../store';

const connectionStore = useConnectionStore();
const { establishedIndexNames } = storeToRefs(connectionStore);

// build options list
const options = computed(() =>
  establishedIndexNames.value.map(name => ({ label: name, value: name })),
);

const handleUpdateValue = (value: string) => {
  connectionStore.selectIndex(value);
};
</script>

<style lang="scss" scoped>
.collection-selector-container {
  height: 100%;
  width: 260px;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border-color);
  :deep(.n-select) {
    .n-base-selection {
      .n-base-selection-label {
        background-color: unset;
      }
      .n-base-selection__border,
      .n-base-selection__state-border {
        border: unset;
      }
    }
    .n-base-selection:hover,
    .n-base-selection--active,
    .n-base-selection--focus {
      .n-base-selection__state-border {
        border: unset;
        box-shadow: unset;
      }
    }
  }
}
</style>
