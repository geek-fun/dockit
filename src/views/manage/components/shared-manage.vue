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
    <n-divider />
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
          <h3 class="shard-detail-title">
            shard: {{ shard.prirep }}{{ shard.shard }} node: {{ shard.node }}
          </h3>
          <n-popover
            trigger="hover"
            :delay="500"
            :duration="500"
            v-for="shardsDetail in shard.details"
          >
            <template #trigger>
              <n-tag :type="shardsDetail.tagType">
                {{ shardsDetail.content }}
                <template #icon>
                  <n-icon :component="shardsDetail.icon" />
                </template>
              </n-tag>
            </template>
            <span> {{ shardsDetail.desc }} </span>
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
  Version,
  WarningAlt,
  Rotate360,
  LaunchStudy1,
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
type IndexShard = ShardState & {
  details: Array<{
    icon: () => unknown;
    content: string;
    desc: string;
    tagType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error';
  }>;
};
const nodeWithShards = ref<Array<NodeWithShard>>([]);
const indexShards = ref<{
  index: string;
  shards: Array<IndexShard>;
}>();

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
  const shards = indexss?.shards.map((shard: ShardState) => ({
    ...shard,
    details: [
      {
        icon: () => h(Document),
        content: `docs: ${shard.docs.count}`,
        desc: 'docs',
        tagType: 'success',
      },
      {
        icon: () => h(VmdkDisk),
        content: `size: ${prettyBytes(shard.store.size)}, dataset: ${prettyBytes(
          shard.dataset.size,
        )}`,
        desc: 'store',
        tagType: 'success',
      },
      {
        icon: () => h(Memory),
        content: `size: ${prettyBytes(shard.completion.size)}`,
        desc: 'completion',
        tagType: 'success',
      },
      {
        icon: () => h(Memory),
        content: `memory_size: ${prettyBytes(shard.fielddata.memorySize)}, evictions: ${shard.fielddata.evictions}`,
        desc: 'fielddata',
        tagType: 'success',
      },
      {
        icon: () => h(Layers),
        content: `memory_size: ${prettyBytes(shard.queryCache.memorySize)}, evictions: ${shard.queryCache.evictions}`,
        desc: 'query_cache',
        tagType: 'success',
      },
      {
        icon: () => h(QueryQueue),
        content: `success: ${shard.get.existsTotal}, ${shard.get.existsTime} failure: ${shard.get.missingTotal}, ${shard.get.missingTime}`,
        desc: 'GET OPERATION',
        tagType: 'success',
      },
      {
        icon: () => h(Insert),
        content: `index: ${shard.indexing.indexTime} delete: ${shard.indexing.deleteTotal}, ${shard.indexing.deleteTime} failures: ${shard.indexing.indexFailed}`,
        desc: 'INDEXING OPERATION',
        tagType: 'success',
      },
      {
        icon: () => h(SearchLocate),
        content: `fetch: ${shard.search.fetchTotal}/${shard.search.fetchTime}, query: ${shard.search.queryTotal}/${shard.search.queryTime}, scroll: ${shard.search.scrollTotal}/${shard.search.scrollTime}, open: ${shard.search.openContexts}`,
        desc: 'SEARCH OPERATION',
        tagType: 'success',
      },
      {
        icon: () => h(ShapeExcept),
        content: `total: ${shard.merges.total}, size: ${prettyBytes(shard.merges.totalSize)}, docs: ${shard.merges.totalDocs} time: ${shard.merges.totalTime}`,
        desc: 'MERGES OPERATION',
        tagType: 'success',
      },
      {
        icon: () => h(Application),
        content: `count: ${shard.segments.count}/${prettyBytes(shard.segments.memory)}, writer: ${prettyBytes(
          shard.segments.indexWriterMemory,
        )}, version_map: ${prettyBytes(shard.segments.versionMapMemory)}, fixed_bitset: ${prettyBytes(
          shard.segments.fixedBitsetMemory,
        )}`,
        desc: 'segments',
        tagType: 'success',
      },

      {
        icon: () => h(Rotate360),
        content: `total: ${shard.refresh.total}, time: ${shard.refresh.time}`,
        desc: 'refresh',
        tagType: 'success',
      },
      {
        icon: () => h(LaunchStudy1),
        content: `total: ${shard.flush.total}, time: ${shard.flush.totalTime}`,
        desc: 'flush',
        tagType: 'success',
      },
      {
        icon: () => h(Version),
        content: `max: ${shard.seqNo.max}, global: ${shard.seqNo.globalCheckpoint}, local: ${shard.seqNo.localCheckpoint}`,
        desc: 'seq_no',
        tagType: 'success',
      },
      {
        icon: () => h(AiResults),
        content: `total: ${shard.suggest.total},time: ${shard.suggest.time}`,
        desc: 'suggest',
        tagType: 'success',
      },
      shard.unassigned.at
        ? {
            icon: () => h(WarningAlt),
            content: `details: ${shard.unassigned.details}, reason: ${shard.unassigned.reason}, for: ${shard.unassigned.for} at: ${shard.unassigned.at}`,
            desc: 'unassigned',
            tagType: 'warning',
          }
        : undefined,
    ].filter(Boolean),
  }));

  indexShards.value = { ...indexss, shards } as { index: string; shards: Array<IndexShard> };
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
    width: 500px;
    height: 500px;
    text-wrap: wrap;
    cursor: default;
    overflow: hidden;

    .n-tag {
      margin: 5px;
    }

    .shard-detail-title {
      margin-left: 5px;
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
