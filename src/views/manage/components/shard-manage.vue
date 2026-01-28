<template>
  <main class="shard-container">
    <div class="shard-table-container">
      <ScrollArea class="h-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                v-for="col in nodeShardsTable?.columns"
                :key="col.key"
                class="whitespace-nowrap"
              >
                <div class="flex items-center gap-1">
                  {{ col.title }}
                  <Popover v-if="col.key === 'index'">
                    <PopoverTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-6 w-6">
                        <span
                          class="i-carbon-search h-3.5 w-3.5"
                          :style="{ color: filterState.index ? 'hsl(var(--primary))' : undefined }"
                        />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent class="w-48 p-2">
                      <Input
                        v-model="filterState.index"
                        placeholder="type to filter index"
                        class="h-8"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(row, rowIndex) in nodeShardsTable?.data" :key="rowIndex">
              <TableCell v-for="col in nodeShardsTable?.columns" :key="col.key">
                <template v-if="col.key === 'index'">{{ row.index }}</template>
                <template v-else>
                  <Button
                    v-for="shard in row[col.key] || []"
                    :key="`${shard.prirep}${shard.shard}`"
                    :variant="shard.prirep === 'p' ? 'secondary' : 'outline'"
                    size="xs"
                    class="shard-box m-1"
                    @click="handleShardClick(shard)"
                  >
                    {{ shard.prirep }}{{ shard.shard }}
                  </Button>
                </template>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
    <transition name="shard-slip">
      <div v-if="indexShards" class="shard-statistic-container">
        <div class="shard-title-container">
          <h3 class="shard-statistic-title">
            <span>INDEX: {{ indexShards.index }}</span>
            <span>
              shards: {{ indexShards.shards.filter(shard => shard.prirep === 'p').length }}/{{
                indexShards.shards.filter(shard => shard.prirep === 'r').length
              }}, unassigned: {{ indexShards.shards.filter(shard => !shard.node).length }}
            </span>
          </h3>
          <span class="i-carbon-close h-6 w-6 close-index-shard-icon" @click="closeindexShards" />
        </div>

        <div class="shard-list-scrollbar-box">
          <ScrollArea class="h-full">
            <div
              v-for="shard in indexShards.shards"
              :key="`${shard.prirep}${shard.shard}`"
              :class="[
                'shard-item-box',
                shard.node ? 'shard-item-primary' : 'shard-item-warning',
                shard.prirep === 'r' ? 'shard-item-dashed' : '',
              ]"
              :title="shard.prirep + shard.shard"
            >
              <h3 class="shard-detail-title">
                shard: {{ shard.prirep }}{{ shard.shard }} node: {{ shard.node }}
              </h3>

              <Popover v-for="(shardsDetail, idx) in shard.details" :key="idx">
                <PopoverTrigger as-child>
                  <Badge
                    :variant="
                      shardsDetail.tagType === 'warning'
                        ? 'warning'
                        : shardsDetail.tagType === 'success'
                          ? 'success'
                          : 'default'
                    "
                    class="m-1 cursor-pointer"
                  >
                    <span :class="[shardsDetail.iconClass, 'h-3 w-3 mr-1']" />
                    {{ shardsDetail.content }}
                  </Badge>
                </PopoverTrigger>
                <PopoverContent class="w-auto">
                  <span>{{ shardsDetail.desc }}</span>
                </PopoverContent>
              </Popover>
            </div>
          </ScrollArea>
        </div>
      </div>
    </transition>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import prettyBytes from 'pretty-bytes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMessageService } from '@/composables';
import { CustomError } from '../../../common';
import { ClusterShard } from '../../../datasources';
import { useClusterManageStore } from '../../../store';

const clusterManageStore = useClusterManageStore();
const { fetchNodes, fetchShards } = clusterManageStore;
const { indices } = storeToRefs(clusterManageStore);
const message = useMessageService();

type IndexShard = ClusterShard & {
  details: Array<{
    iconClass: string;
    content: string;
    desc: string;
    tagType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error';
  }>;
};

const filterState = ref<{ [key: string]: string }>({
  index: '',
});

const nodeShardsTable = computed(() => {
  const nodes = Array.from(
    new Set(
      indices.value
        .flatMap(index => index.shards || [])
        .map(shard => shard.node)
        .filter(Boolean),
    ),
  );

  const columns = [
    { title: 'index', key: 'index' },
    ...nodes.map(name => ({ title: name, key: name })),
    { title: 'unassigned', key: 'unassigned' },
  ];

  // Group shards by index and then by node
  const data = indices.value
    .filter(index =>
      filterState.value.index ? index.index.includes(filterState.value.index) : true,
    )
    .map(index => {
      const result = { index: index.index } as Record<string, any>;

      // Initialize empty arrays for each node and unassigned
      columns.forEach(column => {
        if (column.key !== 'index') {
          result[column.key] = [];
        }
      });

      // Distribute shards to their respective node columns
      (index.shards || []).forEach(shard => {
        if (shard.node) {
          result[shard.node].push(shard);
        } else {
          result['unassigned'].push(shard);
        }
      });

      return result;
    });

  return { columns, data };
});

const indexShards = ref<{
  index: string;
  shards: Array<IndexShard>;
}>();

const refreshShards = async () => {
  try {
    await Promise.all([fetchNodes(), fetchShards()]);
  } catch (err) {
    message.error(
      `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
      {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      },
    );
  }
};

const handleShardClick = async (shard: ClusterShard) => {
  const { shards } = indices.value.find(({ index }) => index === shard.index) || {};
  if (!shards) return;
  const shardList = shards.map((shard: ClusterShard) => ({
    ...shard,
    details: [
      {
        iconClass: 'i-carbon-document',
        content: `docs: ${shard.docs.count}`,
        desc: 'docs',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-vmdk-disk',
        content: `size: ${shard.store.size ? prettyBytes(shard.store.size) : null}, dataset: ${
          shard.dataset.size ? prettyBytes(shard.dataset.size) : null
        }`,
        desc: 'store',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-chip',
        content: `size: ${shard.completion.size ? prettyBytes(shard.completion.size) : null}`,
        desc: 'completion',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-chip',
        content: `memory_size: ${shard.fielddata.memorySize ? prettyBytes(shard.fielddata.memorySize) : null}, evictions: ${shard.fielddata.evictions}`,
        desc: 'fielddata',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-layers',
        content: `memory_size: ${shard.queryCache.memorySize ? prettyBytes(shard.queryCache.memorySize) : null}, evictions: ${shard.queryCache.evictions}`,
        desc: 'query_cache',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-query-queue',
        content: `success: ${shard.get.existsTotal}, ${shard.get.existsTime} failure: ${shard.get.missingTotal}, ${shard.get.missingTime}`,
        desc: 'GET OPERATION',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-insert',
        content: `index: ${shard.indexing.indexTime} delete: ${shard.indexing.deleteTotal}, ${shard.indexing.deleteTime} failures: ${shard.indexing.indexFailed}`,
        desc: 'INDEXING OPERATION',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-search-locate',
        content: `fetch: ${shard.search.fetchTotal}/${shard.search.fetchTime}, query: ${shard.search.queryTotal}/${shard.search.queryTime}, scroll: ${shard.search.scrollTotal}/${shard.search.scrollTime}, open: ${shard.search.openContexts}`,
        desc: 'SEARCH OPERATION',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-shape-except',
        content: `total: ${shard.merges.total}, size: ${shard.merges.totalSize ? prettyBytes(shard.merges.totalSize) : null}, docs: ${shard.merges.totalDocs} time: ${shard.merges.totalTime}`,
        desc: 'MERGES OPERATION',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-application',
        content: `count: ${shard.segments.count}/${prettyBytes(shard.segments.memory ?? 0)}, writer: ${
          shard.segments.indexWriterMemory ? prettyBytes(shard.segments.indexWriterMemory) : null
        }, version_map: ${shard.segments.versionMapMemory ? prettyBytes(shard.segments.versionMapMemory) : null}, fixed_bitset: ${
          shard.segments.fixedBitsetMemory ? prettyBytes(shard.segments.fixedBitsetMemory) : null
        }`,
        desc: 'segments',
        tagType: 'success',
      },

      {
        iconClass: 'i-carbon-rotate-360',
        content: `total: ${shard.refresh.total}, time: ${shard.refresh.time}`,
        desc: 'refresh',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-launch-study-1',
        content: `total: ${shard.flush.total}, time: ${shard.flush.totalTime}`,
        desc: 'flush',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-version',
        content: `max: ${shard.seqNo.max}, global: ${shard.seqNo.globalCheckpoint}, local: ${shard.seqNo.localCheckpoint}`,
        desc: 'seq_no',
        tagType: 'success',
      },
      {
        iconClass: 'i-carbon-ai-results',
        content: `total: ${shard.suggest.total},time: ${shard.suggest.time}`,
        desc: 'suggest',
        tagType: 'success',
      },
      shard.unassigned.at
        ? {
            iconClass: 'i-carbon-warning-alt',
            content: `details: ${shard.unassigned.details}, reason: ${shard.unassigned.reason}, for: ${shard.unassigned.for} at: ${shard.unassigned.at}`,
            desc: 'unassigned',
            tagType: 'warning',
          }
        : undefined,
    ].filter(Boolean),
  }));

  indexShards.value = { index: shard.index, shards: shardList } as {
    index: string;
    shards: Array<IndexShard>;
  };
};

const closeindexShards = () => {
  indexShards.value = undefined;
};

onMounted(async () => {
  await refreshShards();
});
</script>

<style scoped>
.shard-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shard-table-container {
  margin-top: 10px;
  flex: 1;
  height: 0;
  display: flex;
  justify-content: space-around;
  gap: 10px;
}

.shard-statistic-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: hsl(var(--card));
}

.shard-title-container {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid hsl(var(--border));
}

.shard-statistic-title {
  margin: 10px 20px;
  flex-grow: 1;
  display: flex;
  justify-content: space-between;
}

.close-index-shard-icon {
  cursor: pointer;
  color: hsl(var(--foreground));
  transition: 0.3s;
  margin-left: 10px;
  margin-top: 10px;
  margin-right: 30px;
}

.shard-list-scrollbar-box {
  flex: 1;
  height: 0;
  gap: 5px;
}

.shard-item-box {
  margin: 10px;
  padding: 10px;
  width: 450px;
  height: 450px;
  text-wrap: wrap;
  cursor: default;
  overflow: hidden;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
}

.shard-item-primary {
  background-color: hsl(var(--primary) / 0.1);
  border-color: hsl(var(--primary));
}

.shard-item-warning {
  background-color: hsl(45 93% 47% / 0.1);
  border-color: hsl(45 93% 47%);
}

.shard-item-dashed {
  border-style: dashed;
}

.shard-detail-title {
  margin-left: 5px;
  margin-bottom: 8px;
}

/* animation for shard-statistic-container */
.shard-slip-enter-active,
.shard-slip-leave-active {
  transition:
    transform 0.5s cubic-bezier(0.55, 0, 0.1, 1),
    opacity 0.5s;
}

.shard-slip-enter-from {
  transform: translateY(40px);
  opacity: 0;
}

.shard-slip-enter-to,
.shard-slip-leave-from {
  transform: translateY(0);
  opacity: 1;
}

.shard-slip-leave-to {
  transform: translateY(-40px);
  opacity: 0;
}
</style>
