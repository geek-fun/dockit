<template>
  <main>
    <div class="shard-container">
      <n-card v-for="node in nodeWithShards" :key="node.name" :title="node.name">
        <n-scrollbar style="max-height: 400px">
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
                @click="handleShardClick(shard)"
              >
                {{ shard.prirep }}{{ shard.shard }}
              </n-button>
            </n-collapse-item>
          </n-collapse>
        </n-scrollbar>
      </n-card>
    </div>
    <n-tag type="success"> Yes It Is </n-tag>
    <n-card v-if="indexShards" :title="indexShards.index">
      <template #header-extra>
        shards: {{ indexShards.shards.filter(shard => shard.prirep === 'p').length }}/{{
          indexShards.shards.filter(shard => shard.prirep === 'r').length
        }}, unassigned: {{ indexShards.shards.filter(shard => !shard.node).length }}
      </template>
      <div class="shard-list-container">
        <n-button
          strong
          tag="div"
          :type="shard.node ? 'primary' : 'warning'"
          :dashed="shard.prirep == 'r'"
          :secondary="shard.prirep == 'p'"
          v-for="shard in indexShards.shards"
          :title="shard.prirep + shard.shard"
          class="shard-item-box"
        >
          <p>shard: {{ shard.prirep }}{{ shard.shard }} node: {{ shard.node }}</p>
          <p>docs: {{ shard.docs.count }}</p>
          <p>memory:</p>
          <p>completion: {{ prettyBytes(shard.completion.size) }}</p>
          <p>disk:</p>
          <p>
            size: {{ prettyBytes(shard.store.size) }}, dataset:{{ prettyBytes(shard.dataset.size) }}
          </p>
          <p>fielddata</p>
          <p>
            memorySize:{{ prettyBytes(shard.fielddata.memorySize) }}, evictions:{{
              shard.fielddata.evictions
            }}e
          </p>
        </n-button>
      </div>
    </n-card>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Shard, ShardState, useConnectionStore } from '../../../store';
import prettyBytes from 'pretty-bytes';

const connectionStore = useConnectionStore();
const { fetchNodes, fetchShards, getShardState } = connectionStore;
const { established } = storeToRefs(connectionStore);

type NodeWithShard = {
  name: string;
  indices: Array<{
    index: string;
    shards: Array<Shard>;
  }>;
};

const nodeWithShards = ref<Array<NodeWithShard>>([]);
const indexShards = ref<{ index: string; shards: Array<ShardState> }>();
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

const handleShardClick = async (shard: Shard) => {
  const indexss = await getShardState(shard.index);

  console.log('handleShardClick', { shard, indexss });
  indexShards.value = indexss;
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

.shard-list-container {
  display: flex;
  gap: 10px;
  justify-content: flex-start;
  flex-wrap: wrap;
  .shard-item-box {
    margin: 0;
    padding: 0;
    width: 300px;
    height: 300px;
    cursor: default;
  }
  :deep(.n-button) {
    .n-button__content {
      display: block;
      text-align: left;
    }
  }
}
</style>
