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
    <n-tag type="success"> Yes It Is</n-tag>
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
          <n-tag type="success">
            docs: {{ shard.docs.count }}
            <template #icon>
              <n-icon :component="Document" />
            </template>
          </n-tag>

          <n-tag type="success">
            size: {{ prettyBytes(shard.store.size) }}, dataset:{{ prettyBytes(shard.dataset.size) }}
            <template #icon>
              <n-icon :component="VmdkDisk" />
            </template>
          </n-tag>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                {{ prettyBytes(shard.completion.size) }}
                <template #icon>
                  <n-icon :component="Memory" />
                </template>
              </n-tag>
            </template>
            <span>
              completion: completion.size is the size of the memory used by the completion data
              structure,completion data structure in Elasticsearch is a highly efficient mechanism
              for providing real-time search suggestions.
            </span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                size:{{ prettyBytes(shard.fielddata.memorySize) }}, evictions:{{
                  shard.fielddata.evictions
                }}
                <template #icon>
                  <n-icon :component="Memory" />
                </template>
              </n-tag>
            </template>
            <span>
              fielddata memory_size and evictions Elasticsearch used for sorting and aggregations on
              text fields
            </span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                size:{{ prettyBytes(shard.queryCache.memorySize) }}, evictions:{{
                  shard.queryCache.evictions
                }}
                <template #icon>
                  <n-icon :component="Layers" />
                </template>
              </n-tag>
            </template>
            <span> queryCache </span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                success: {{ shard.get.existsTotal }},{{ shard.get.existsTime }} failure:
                {{ shard.get.missingTotal }},{{ shard.get.missingTime }}
                <template #icon>
                  <n-icon :component="QueryQueue" />
                </template>
              </n-tag>
            </template>
            <span> GET OPERATION</span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>
                  index: {{ shard.indexing.indexTime }}delete:{{ shard.indexing.deleteTotal }},{{
                    shard.indexing.deleteTime
                  }}
                  failures:
                  {{ shard.indexing.indexFailed }}
                </p>
                <template #icon>
                  <n-icon :component="Insert" />
                </template>
              </n-tag>
            </template>
            <span> INDEXING OPERATION</span>
          </n-popover>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>
                  fetch: {{ shard.search.fetchTotal }}/{{ shard.search.fetchTime }},query:
                  {{ shard.search.queryTotal }}/{{ shard.search.queryTime }},scroll:{{
                    shard.search.scrollTotal
                  }}/{{ shard.search.scrollTime }},open:
                  {{ shard.search.openContexts }}
                </p>
                <template #icon>
                  <n-icon :component="SearchLocate" />
                </template>
              </n-tag>
            </template>
            <span>SEARCH OPERATION</span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>
                  complete {{ shard.merges.total }}, {{ prettyBytes(shard.merges.totalSize) }},{{
                    shard.merges.totalDocs
                  }}
                  docs,
                  {{ shard.merges.totalTime }}
                </p>
                <template #icon>
                  <n-icon :component="ShapeExcept" />
                </template>
              </n-tag>
            </template>
            <span> MERGES OPERATION</span>
          </n-popover>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>{{ shard.refresh.total }},{{ shard.refresh.time }}</p>
                <template #icon>
                  <n-icon :component="ShapeExcept" />
                </template>
              </n-tag>
            </template>
            <span>refresh</span>
          </n-popover>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>{{ shard.flush.total }},{{ shard.flush.time }}</p>
                <template #icon>
                  <n-icon :component="ShapeExcept" />
                </template>
              </n-tag>
            </template>
            <span>flush</span>
          </n-popover>

          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>
                  {{ shard.segments.count }}/{{ prettyBytes(shard.segments.memory) }},writer:
                  {{ prettyBytes(shard.segments.indexWriterMemory) }},version_map:{{
                    prettyBytes(shard.segments.versionMapMemory)
                  }}, fixed_bitset:{{ prettyBytes(shard.segments.fixedBitsetMemory) }}
                </p>
                <template #icon>
                  <n-icon :component="Application" />
                </template>
              </n-tag>
            </template>
            <span>segments</span>
          </n-popover>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>
                  max:{{ shard.seqNo.max }},global: {{ shard.seqNo.globalCheckpoint }}, local:
                  {{ shard.seqNo.localCheckpoint }}
                </p>
                <template #icon>
                  <n-icon :component="Application" />
                </template>
              </n-tag>
            </template>
            <span>seq_no</span>
          </n-popover>
          <n-popover trigger="hover" :delay="500" :duration="500">
            <template #trigger>
              <n-tag type="success">
                <p>{{ shard.suggest.total }}/{{ shard.suggest.time }}</p>
                <template #icon>
                  <n-icon :component="AiResults" />
                </template>
              </n-tag>
            </template>
            <span>suggest</span>
          </n-popover>
        </n-button>
      </div>
    </n-card>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Shard, ShardState, useConnectionStore } from '../../../store';
import prettyBytes from 'pretty-bytes';
import {
  Document,
  VmdkDisk,
  Insert,
  QueryQueue,
  Layers,
  ShapeExcept,
  SearchLocate,
  Application,
  AiResults,
} from '@vicons/carbon';
import { Memory } from '@vicons/fa';

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
    width: 400px;
    height: 400px;
    text-wrap: wrap;
    cursor: default;

    .n-tag {
      margin: 5px;
    }
  }

  :deep(.n-button) {
    .n-button__content {
      display: block;
      text-align: left;
    }
  }
}
</style>
