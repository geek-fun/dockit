<template>
  <div class="node-state-container">
    <ScrollArea class="node-scroll-area">
      <div class="node-list-container">
        <Card
          v-for="node in nodes"
          :key="node.name"
          class="node-item hover:bg-accent cursor-pointer"
          @click="handleNodeClick(node.name)"
        >
          <CardHeader class="pb-2">
            <CardTitle class="text-base">{{ node.name }}</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="node-rule-icon">
              <TooltipProvider v-if="node.master">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="i-carbon-star-filled h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{{ $t('manage.masterNode') }}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider
                v-if="node.roles.includes(NodeRoleEnum.MASTER_ELIGIBLE) && !node.master"
              >
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="i-carbon-star h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{{ $t('manage.masterEligible') }}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider v-if="node.roles.includes(NodeRoleEnum.DATA)">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="i-carbon-vmdk-disk h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{{ $t('manage.dataNode') }}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider v-if="node.roles.includes(NodeRoleEnum.INGEST)">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="i-carbon-folder-move-to h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{{ $t('manage.ingestNode') }}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider v-if="node.roles.includes(NodeRoleEnum.COORDINATING)">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <span class="i-carbon-network-3 h-6 w-6" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{{ $t('manage.coordinatingNode') }}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
    <div class="node-state-bar">
      <div v-for="stateItem in nodeStats" :key="stateItem.key" class="node-state-bar-item">
        <p>{{ $t(`manage.node.${stateItem.key}`) }}</p>
        <p>{{ stateItem.value }}</p>
      </div>
    </div>
    <div class="node-statistic-container">
      <h3>{{ $t('manage.node.statisticTitle') }}</h3>
      <div class="node-statistic-metric-container">
        <div v-for="progress in nodeStatistics" :key="progress.name" class="node-statistic-item">
          <div class="progress-circle">
            <svg viewBox="0 0 100 100" class="progress-svg">
              <circle
                class="progress-background"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke-width="8"
              />
              <circle
                class="progress-indicator"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke-width="8"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="circumference - (progress.percent / 100) * circumference"
              />
            </svg>
            <div class="progress-content">
              <p>{{ $t(`manage.node.${progress.name}`) }}</p>
              <p>{{ progress.percent }} %</p>
            </div>
          </div>
          <p>{{ prettyBytes(progress.current || 0) }}/{{ prettyBytes(progress.max || 0) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import prettyBytes from 'pretty-bytes';
import { useClusterManageStore } from '../../../store';
import { storeToRefs } from 'pinia';
import { CustomError } from '../../../common';
import { NodeRoleEnum } from '../../../datasources';
import { useMessageService } from '@/composables';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const clusterManageStore = useClusterManageStore();
const { fetchNodes } = clusterManageStore;
const { nodes } = storeToRefs(clusterManageStore);

const message = useMessageService();

const circumference = 2 * Math.PI * 45;

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
  const selectedNode = nodes.value.find(node => node.name === nodeName);
  if (!selectedNode) return;
  const { ip, ram, disk, shard, mapping, heap } = selectedNode;
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
  ] as Array<NodeStatistics>;
};

onMounted(async () => {
  try {
    await fetchNodes();
  } catch (err) {
    const { status, details } = err as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
});
</script>

<style scoped>
.node-state-container {
  width: 100%;
  height: 100%;
}

.node-scroll-area {
  min-height: 120px;
  max-height: 420px;
}

.node-list-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 15px;
  margin-top: 10px;
  cursor: pointer;
}

.node-item {
  max-width: 300px;
}

.node-rule-icon {
  display: flex;
  width: 100%;
  gap: 4px;
}

.node-state-bar {
  margin: 10px 0;
  height: 90px;
  border-radius: 3px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  color: hsl(var(--card-foreground));
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  justify-content: space-around;
  text-align: center;
}

.node-statistic-container h3 {
  margin: 20px;
}

.node-statistic-metric-container {
  display: flex;
  justify-content: space-around;
}

.node-statistic-item {
  text-align: center;
}

.progress-circle {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.progress-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.progress-background {
  stroke: hsl(var(--secondary));
}

.progress-indicator {
  stroke: hsl(var(--primary));
  transition: stroke-dashoffset 0.3s ease;
}

.progress-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.progress-content p {
  margin: 0;
  font-size: 14px;
}
</style>
