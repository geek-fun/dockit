<template>
  <n-scrollbar style="max-height: 420px">
    <div class="node-list-container">
      <n-card
        class="node-item"
        hoverable
        v-for="node in established?.rawClusterState?.nodes.instances"
        :key="node.name"
        :title="node.name"
      >
        {{ node.name }}
      </n-card>
    </div>
  </n-scrollbar>
  <div class="node-state-bar">
    <div v-for="stateItem in nodeStats" :key="stateItem.key" class="node-state-bar-item">
      <p>{{ stateItem.key }}</p>
      <p>{{ stateItem.value }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConnectionStore } from '../../../store';
import { storeToRefs } from 'pinia';

const connectionStore = useConnectionStore();
const { fetchNodes } = connectionStore;
const { established } = storeToRefs(connectionStore);
const nodeStats = ref([
  {
    key: 'status',
    value: 'green',
  },
  {
    key: 'alerts',
    value: '3',
  },
  {
    key: 'ip',
    value: '21.155.209.72:9300',
  },
  {
    key: 'JVM',
    value: '43%',
  },
  {
    key: 'disk',
    value: '1%',
  },
  {
    key: 'docs',
    value: '970.8k',
  },
  {
    key: 'data',
    value: '644.4 MB',
  },
  {
    key: 'index',
    value: 31,
  },
  {
    key: 'shards',
    value: 31,
  },
]);
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
    max-width: 300px;
  }
}
.node-state-bar {
  margin: 10px 0;
  border-radius: 3px;
  border: 1px solid var(--border-color);
  background-color: var(--n-color);
  color: var(--n-text-color);
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-around;
  text-align: center;
}
</style>
