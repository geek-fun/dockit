<template>
  <main class="shard-container">
    <n-card class="shard-item" v-for="node in nodeWithShards" :key="node.name" :title="node.name">
      <div v-for="nodeIndex in node.indices">
        <h3>{{ nodeIndex.index }}</h3>
        <n-card class="shard-item" v-for="shard in nodeIndex.shards" :key="shard.shard">
          <p>shard: {{ shard.shard }}</p>
          <p>state: {{ shard.state }}</p>
          <p>node: {{ shard.node }}</p>
          <p>index: {{ shard.index }}</p>
        </n-card>
      </div>
    </n-card>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Shard, useConnectionStore } from '../../../store';

const connectionStore = useConnectionStore();
const { fetchNodes, fetchShards } = connectionStore;
const { established } = storeToRefs(connectionStore);

type NodeWithShard = {
  name: string;
  indices: Array<{
    index: string;
    shards: Array<Shard>;
  }>;
};

const nodeWithShards = ref<Array<NodeWithShard>>([]);

const refreshShards = async (): Promise<Array<NodeWithShard>> => {
  const nodes = established.value?.rawClusterState?.nodes.instances;
  if (!nodes) return [];

  const shards = await fetchShards();
  const nodeIndices = [{ name: null }, ...nodes].map(node => {
    const nodeShards = shards?.filter(shard => shard.node === node.name);
    if (!nodeShards) return;

    const indices = Array.from(new Set(nodeShards.map(shard => shard.index))).map(index => ({
      index,
      shards: nodeShards.filter(shard => shard.index === index),
    }));

    return { name: node.name || 'unassigned', indices };
  });
  console.log('nodeIndices', nodeIndices);

  return nodeIndices as Array<NodeWithShard>;
};

onMounted(async () => {
  await fetchNodes();
  nodeWithShards.value = (await refreshShards()) || [];
});
fetchNodes();
</script>

<style lang="scss" scoped>
.shard-container {
  display: flex;
  justify-content: space-around;
  padding-top: 20px;

  .shard-item {
    width: 200px;
    height: 400px;
  }
}
</style>
