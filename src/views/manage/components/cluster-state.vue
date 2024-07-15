<template>
  <div class="manage-state-container">
    <n-card class="cluster-item-box cluster-cluster-box">
      <p>
        <span>{{ $t('manage.cluster') }}</span>
        <n-icon size="24" class="status-icon"><CheckmarkOutline /></n-icon>
      </p>
      <p>name: {{ props.cluster?.cluster_name }}</p>
      <p>id: {{ props.cluster?.cluster_uuid }}</p>
    </n-card>
    <n-card class="cluster-item-box cluster-nodes-box">
      <p>{{ $t('manage.nodes') }}: {{ clusterState.cluster.count }}</p>
      <p>master: {{ clusterState.cluster.masterNode }}</p>
      <p>data: {{ clusterState.cluster.dataNode }}</p>
    </n-card>
    <n-card class="cluster-item-box cluster-shards-box">
      <p>{{ $t('manage.shards') }}: {{ clusterState.shards.count }}</p>
      xxxx
    </n-card>
    <n-card class="cluster-item-box cluster-indices-box">
      <p>{{ $t('manage.indices') }}: {{ clusterState.indices.count }}</p>
      xxxx
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { CheckmarkOutline } from '@vicons/carbon';
import { RawClusterState } from '../../../store';

const props = defineProps<{ cluster: RawClusterState | null }>();

const clusterState = computed(() => {
  const nodes = Object.entries(props.cluster?.nodes || {}).map(([key, value]) => ({
    id: key,
    ...value,
  }));
  // const shards = Object.entries(props.cluster?.shards || {}).map(([key, value]) => ({
  //   id: key,
  //   ...value,
  // }));
  const indices = Object.entries(props.cluster?.metadata.indices || {}).map(([key, value]) => ({
    id: key,
    ...(value as Object),
  }));

  return {
    cluster: {
      count: nodes.length,
      masterNode: nodes.filter(node => node).length,
      dataNode: nodes.filter(node => node).length,
    },
    shards: {
      count: 1,
    },
    indices: {
      count: indices.length,
    },
  };
});
</script>

<style lang="scss" scoped>
.manage-state-container {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  margin-top: 10px;
  .n-card {
    max-width: 300px;
  }
  .cluster-item-box p:first-of-type {
    font-size: 28px;
    font-weight: bold;
    margin-block: 0;
    color: #2478ec;
  }
  .cluster-cluster-box p:first-of-type {
    color: #36ad6a;
    span {
      height: 100%;
      margin-right: 10px;
    }
  }
}
</style>
