<template>
  <main class="shard-container">
    <n-card v-for="node in nodeWithShards" :key="node.name" :title="node.name">
      <n-collapse>
        <n-collapse-item
          v-for="nodeIndex in node.indices"
          :title="nodeIndex.index"
          :name="nodeIndex.index"
          class="shard-collapse-container"
        >
          <n-button
            v-for="shard in nodeIndex.shards"
            strong
            :secondary="shard.prirep == 'p'"
            type="primary"
            :dashed="shard.prirep == 'r'"
            class="shard-box"
          >
            {{ shard.prirep }}{{ shard.shard }}
          </n-button>
        </n-collapse-item>
      </n-collapse>
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
      shards: nodeShards
        .filter(shard => shard.index === index)
        .sort((a, b) => a.prirep.localeCompare(b.prirep)),
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
  gap: 15px;
  .shard-box {
    margin: 5px;
  }
}
</style>
