<template>
  <main class="shard-container">
    <div class="shard-table-container">
      <n-infinite-scroll style="height: 100%">
        <n-data-table
          :columns="nodeShardsTable?.columns"
          :data="nodeShardsTable?.data"
          :bordered="false"
        />
      </n-infinite-scroll>
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
          <n-icon size="26" @click="closeindexShards" class="close-index-shard-icon">
            <Close />
          </n-icon>
        </div>

        <div class="shard-list-scrollbar-box">
          <n-scrollbar style="height: 100%">
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
                      <n-icon :component="shardsDetail.icon()" />
                    </template>
                  </n-tag>
                </template>
                <span> {{ shardsDetail.desc }} </span>
              </n-popover>
            </n-button>
          </n-scrollbar>
        </div>
      </div>
    </transition>
  </main>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { get, size } from 'lodash';

import prettyBytes from 'pretty-bytes';
import {
  AiResults,
  Application,
  Close,
  Document,
  Insert,
  LaunchStudy1,
  Layers,
  QueryQueue,
  Rotate360,
  SearchLocate,
  ShapeExcept,
  Version,
  VmdkDisk,
  WarningAlt,
  Search,
} from '@vicons/carbon';
import { Memory } from '@vicons/fa';
import { NButton, NIcon, NInput, NTag } from 'naive-ui';
import { TableColumn } from 'naive-ui/es/data-table/src/interface';
import { CustomError, inputProps } from '../../../common';
import { ClusterShard } from '../../../datasources';
import { useClusterManageStore } from '../../../store';

const clusterManageStore = useClusterManageStore();
const { fetchNodes, fetchShards } = clusterManageStore;
const { indices } = storeToRefs(clusterManageStore);
const message = useMessage();

type IndexShard = ClusterShard & {
  details: Array<{
    icon: () => Component;
    content: string;
    desc: string;
    tagType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error';
  }>;
};

const filterState = ref<{ [key: string]: string }>({
  index: '',
});

const handleFilter = (key: string, value: string) => {
  filterState.value[key] = value;
};

const filterProps = (key: string) => ({
  filter: true,
  renderFilterMenu(_: { hide: () => void }) {
    return h(NInput, {
      value: filterState.value[key],
      placeholder: `type to filter ${key}`,
      clearable: true,
      size: 'small',
      'on-update:value': (value: string) => handleFilter(key, value),
      'input-props': inputProps,
    });
  },
  renderFilterIcon() {
    return h(
      NIcon,
      { color: filterState.value[key] ? 'var(--theme-color)' : 'var(--n-text-color)' },
      { default: () => h(Search) },
    );
  },
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

  const columns = [{ name: 'index' }, ...nodes.map(name => ({ name })), { name: 'unassigned' }];

  // Group shards by index and then by node
  const data = indices.value
    .filter(index =>
      filterState.value.index ? index.index.includes(filterState.value.index) : true,
    )
    .map(index => {
      const result = { index: index.index } as Record<string, any>;

      // Initialize empty arrays for each node and unassigned
      columns.forEach(column => {
        if (column.name !== 'index') {
          result[column.name] = [];
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

  return {
    columns: columns.map(column => ({
      title: column.name,
      key: column.name,
      sorter:
        column.name === 'index'
          ? 'default'
          : (a: any, b: any) => size(get(a, column.name)) - size(get(b, column.name)),
      ...(column.name === 'index' ? filterProps(column.name) : {}),
      render(row: { [key: string]: any }) {
        if (column.name === 'index') return row.index;
        return (row[column.name] || []).map((shard: ClusterShard) =>
          h(
            NButton,
            {
              strong: true,
              type: 'primary',
              secondary: shard.prirep == 'p',
              dashed: shard.prirep == 'r',
              onClick: () => handleShardClick(shard),
              class: 'shard-box',
            },
            {
              default: () => `${shard.prirep}${shard.shard}`,
            },
          ),
        );
      },
    })) as TableColumn[],
    data,
  };
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
        icon: () => Document,
        content: `docs: ${shard.docs.count}`,
        desc: 'docs',
        tagType: 'success',
      },
      {
        icon: () => VmdkDisk,
        content: `size: ${shard.store.size ? prettyBytes(shard.store.size) : null}, dataset: ${
          shard.dataset.size ? prettyBytes(shard.dataset.size) : null
        }`,
        desc: 'store',
        tagType: 'success',
      },
      {
        icon: () => Memory,
        content: `size: ${shard.completion.size ? prettyBytes(shard.completion.size) : null}`,
        desc: 'completion',
        tagType: 'success',
      },
      {
        icon: () => Memory,
        content: `memory_size: ${shard.fielddata.memorySize ? prettyBytes(shard.fielddata.memorySize) : null}, evictions: ${shard.fielddata.evictions}`,
        desc: 'fielddata',
        tagType: 'success',
      },
      {
        icon: () => Layers,
        content: `memory_size: ${shard.queryCache.memorySize ? prettyBytes(shard.queryCache.memorySize) : null}, evictions: ${shard.queryCache.evictions}`,
        desc: 'query_cache',
        tagType: 'success',
      },
      {
        icon: () => QueryQueue,
        content: `success: ${shard.get.existsTotal}, ${shard.get.existsTime} failure: ${shard.get.missingTotal}, ${shard.get.missingTime}`,
        desc: 'GET OPERATION',
        tagType: 'success',
      },
      {
        icon: () => Insert,
        content: `index: ${shard.indexing.indexTime} delete: ${shard.indexing.deleteTotal}, ${shard.indexing.deleteTime} failures: ${shard.indexing.indexFailed}`,
        desc: 'INDEXING OPERATION',
        tagType: 'success',
      },
      {
        icon: () => SearchLocate,
        content: `fetch: ${shard.search.fetchTotal}/${shard.search.fetchTime}, query: ${shard.search.queryTotal}/${shard.search.queryTime}, scroll: ${shard.search.scrollTotal}/${shard.search.scrollTime}, open: ${shard.search.openContexts}`,
        desc: 'SEARCH OPERATION',
        tagType: 'success',
      },
      {
        icon: () => ShapeExcept,
        content: `total: ${shard.merges.total}, size: ${shard.merges.totalSize ? prettyBytes(shard.merges.totalSize) : null}, docs: ${shard.merges.totalDocs} time: ${shard.merges.totalTime}`,
        desc: 'MERGES OPERATION',
        tagType: 'success',
      },
      {
        icon: () => Application,
        content: `count: ${shard.segments.count}/${prettyBytes(shard.segments.memory ?? 0)}, writer: ${
          shard.segments.indexWriterMemory ? prettyBytes(shard.segments.indexWriterMemory) : null
        }, version_map: ${shard.segments.versionMapMemory ? prettyBytes(shard.segments.versionMapMemory) : null}, fixed_bitset: ${
          shard.segments.fixedBitsetMemory ? prettyBytes(shard.segments.fixedBitsetMemory) : null
        }`,
        desc: 'segments',
        tagType: 'success',
      },

      {
        icon: () => Rotate360,
        content: `total: ${shard.refresh.total}, time: ${shard.refresh.time}`,
        desc: 'refresh',
        tagType: 'success',
      },
      {
        icon: () => LaunchStudy1,
        content: `total: ${shard.flush.total}, time: ${shard.flush.totalTime}`,
        desc: 'flush',
        tagType: 'success',
      },
      {
        icon: () => Version,
        content: `max: ${shard.seqNo.max}, global: ${shard.seqNo.globalCheckpoint}, local: ${shard.seqNo.localCheckpoint}`,
        desc: 'seq_no',
        tagType: 'success',
      },
      {
        icon: () => AiResults,
        content: `total: ${shard.suggest.total},time: ${shard.suggest.time}`,
        desc: 'suggest',
        tagType: 'success',
      },
      shard.unassigned.at
        ? {
            icon: () => WarningAlt,
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

<style lang="scss" scoped>
.shard-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .shard-table-container {
    margin-top: 10px;
    flex: 1;
    height: 0;
    display: flex;
    justify-content: space-around;
    gap: 10px;

    :deep(.n-data-table-tbody) {
      .shard-box {
        margin: 5px;
      }
    }
    :deep(.n-data-table-th__title) {
      white-space: nowrap;
    }
  }

  .shard-statistic-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--card-bg-color);

    .shard-title-container {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color);

      .shard-statistic-title {
        margin: 10px 20px;
        flex-grow: 1;
        display: flex;
        justify-content: space-between;
      }

      .close-index-shard-icon {
        cursor: pointer;
        color: var(--text-color);
        transition: 0.3s;
        margin-left: 10px;
        margin-top: 10px;
        margin-right: 30px;
      }
    }

    .shard-list-scrollbar-box {
      flex: 1;
      height: 0;
      gap: 5px;

      :deep(.n-button) {
        .n-button__content {
          display: block;
          text-align: left;
        }
      }

      .shard-item-box {
        margin: 10px;
        padding: 0;
        width: 450px;
        height: 450px;
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
    }
  }
}

//animation for shard-statistic-container
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
