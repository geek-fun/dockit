<template>
  <div class="node-state-container">
    <n-scrollbar style="min-height: 120px; max-height: 420px">
      <div class="node-list-container">
        <n-card
          class="node-item"
          hoverable
          v-for="node in established?.rawClusterState?.nodes.instances"
          :key="node.name"
          :title="node.name"
          @click="handleNodeClick(node.name)"
        >
          <n-icon size="24" class="node-rule-icon">
            <n-popover trigger="hover" v-if="node.master">
              <template #trigger>
                <StarFilled />
              </template>
              <span>{{ $t('manage.masterNode') }}</span>
            </n-popover>
            <n-popover
              trigger="hover"
              v-if="node.roles.includes(NodeRoleEnum.MASTER_ELIGIBLE) && !node.master"
            >
              <template #trigger>
                <Star />
              </template>
              <span>{{ $t('manage.masterEligible') }}</span>
            </n-popover>
            <n-popover trigger="hover" v-if="node.roles.includes(NodeRoleEnum.DATA)">
              <template #trigger>
                <VmdkDisk />
              </template>
              <span>{{ $t('manage.dataNode') }}</span>
            </n-popover>

            <n-popover trigger="hover" v-if="node.roles.includes(NodeRoleEnum.INGEST)">
              <template #trigger>
                <FolderMoveTo />
              </template>
              <span>{{ $t('manage.ingestNode') }}</span>
            </n-popover>
            <n-popover trigger="hover" v-if="node.roles.includes(NodeRoleEnum.COORDINATING)">
              <template #trigger>
                <Network3 />
              </template>
              <span>{{ $t('manage.coordinatingNode') }}</span>
            </n-popover>
          </n-icon>
        </n-card>
      </div>
    </n-scrollbar>
    <div class="node-state-bar">
      <div v-for="stateItem in nodeStats" :key="stateItem.key" class="node-state-bar-item">
        <p>{{ $t(`manage.node.${stateItem.key}`) }}</p>
        <p>{{ stateItem.value }}</p>
      </div>
    </div>
    <div class="node-statistic-container">
      <h3>{{ $t('manage.node.statisticTitle') }}</h3>
      <div class="node-statistic-metric-container">
        <div v-for="progress in nodeStatistics">
          <n-progress type="circle" :percentage="progress.percent" :offset-degree="progress.max">
            <div style="text-align: center">
              <p>{{ $t(`manage.node.${progress.name}`) }}</p>
              <p>{{ progress.percent }} %</p>
            </div>
          </n-progress>
          <p>{{ prettyBytes(progress.current || 0) }}/{{ prettyBytes(progress.max || 0) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import prettyBytes from 'pretty-bytes';
import { NodeRoleEnum, useConnectionStore } from '../../../store';
import { storeToRefs } from 'pinia';
import { StarFilled, Star, FolderMoveTo, VmdkDisk, Network3 } from '@vicons/carbon';

const connectionStore = useConnectionStore();
const { fetchNodes, fetchNodeState } = connectionStore;
const { established } = storeToRefs(connectionStore);
type NodeStats = {
  key: string;
  value: string | number;
};
type NodeStatistics = {
  name: string;
  percent: number;
  current: number;
  max: number;
};
const nodeStats = ref<Array<NodeStats>>([
  { key: 'ip', value: '' },
  { key: 'ram', value: '' },
  { key: 'disk', value: '' },
  { key: 'shards', value: '' },
  { key: 'mappings', value: '' },
]);

const nodeStatistics = ref<Array<NodeStatistics>>([]);

const handleNodeClick = async (nodeName: string) => {
  const latestState = await fetchNodeState(nodeName);
  if (!latestState) return;
  const { ip, ram, disk, shard, mapping, heap } = latestState;
  nodeStats.value = [
    { key: 'ip', value: ip },
    { key: 'ram', value: prettyBytes(ram.max || 0) },
    { key: 'disk', value: prettyBytes(disk.max || 0) },

    { key: 'shards', value: shard.total || '' },
    { key: 'mappings', value: mapping.total || '' },
  ];
  nodeStatistics.value = [
    { name: 'ram', ...ram },
    { name: 'disk', ...disk },
    { name: 'heap', ...heap },
  ];
};
fetchNodes();
</script>

<style scoped lang="scss">
.node-state-container {
  width: 100%;
  height: 100%;

  .node-list-container {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 15px;
    margin-top: 10px;
    cursor: pointer;

    .node-item {
      max-width: 300px;

      .node-rule-icon {
        display: flex;
        width: 100%;
      }
    }
  }

  .node-state-bar {
    margin: 10px 0;
    height: 90px;
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
  .node-statistic-container {
    > h3 {
      margin: 20px;
    }
    .node-statistic-metric-container {
      display: flex;
      justify-content: space-around;
    }
  }
}
</style>
