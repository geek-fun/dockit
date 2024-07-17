<template>
  <div class="node-list-container">
    <n-card
      class="node-item"
      hoverable
      v-for="node in established?.rawClusterState?.nodes.instances"
      :key="node.name"
      :title="node.name"
    >
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { useConnectionStore } from '../../../store';
import { storeToRefs } from 'pinia';

const connectionStore = useConnectionStore();
const { fetchNodes } = connectionStore;
const { established } = storeToRefs(connectionStore);

fetchNodes();
</script>

<style scoped lang="scss">
.node-list-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 15px;
  margin-top: 10px;
  cursor: pointer;
  .node-item {
    max-width: 200px;
  }
}
</style>
