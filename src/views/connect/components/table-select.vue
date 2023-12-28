<template>
  <div class="table-select-container">
    <n-select v-model:value="value" :options="options" placeholder="no table selected" />
  </div>
</template>

<script setup lang="ts">
const value = ref(null);

const options = ref([
  { label: '1', value: 2 },
  { label: '2', value: 1 },
]);
</script>

<style lang="scss" scoped>
.table-select-container {
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
