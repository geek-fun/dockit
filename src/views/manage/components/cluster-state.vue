<template>
  <div class="manage-state-container">
    <n-card
      class="cluster-item-box cluster-cluster-box"
      :class="{
        'cluster-status-color-green': props.cluster?.status == 'green',
        'cluster-status-color-yellow': props.cluster?.status == 'yellow',
        'cluster-status-color-red': props.cluster?.status == 'red',
      }"
    >
      <p>
        <span>{{ $t('manage.cluster') }}</span>
        <n-icon size="24">
          <CheckmarkOutline v-if="props.cluster?.status == 'green'" />
          <WarningAlt v-else-if="props.cluster?.status == 'yellow'" />
          <MisuseOutline v-else-if="props.cluster?.status == 'red'" />
        </n-icon>
      </p>
      <p>name: {{ props.cluster?.cluster_name }}</p>
      <p>id: {{ props.cluster?.cluster_uuid }}</p>
      <p>version: {{ props.cluster?.nodes.versions }}</p>
    </n-card>
    <n-card class="cluster-item-box cluster-nodes-box">
      <p>{{ $t('manage.nodes') }}: {{ props.cluster?.nodes.count.total }}</p>
      <p>master: {{ props.cluster?.nodes.count.master }}</p>
      <p>data: {{ props.cluster?.nodes.count.data }}</p>
    </n-card>
    <n-card class="cluster-item-box cluster-shards-box">
      <p>{{ $t('manage.shards') }}: {{ props.cluster?.indices.shards.total }}</p>
      <p>primaries: {{ props.cluster?.indices.shards.primaries }}</p>
      <p>
        replicas:
        {{
          (props.cluster?.indices?.shards?.total || 0) -
          (props.cluster?.indices.shards?.primaries || 0)
        }}
      </p>
    </n-card>
    <n-card class="cluster-item-box cluster-indices-box">
      <p>{{ $t('manage.indices') }}: {{ props.cluster?.indices.count }}</p>
      <p>docs: {{ props.cluster?.indices.docs.count }}</p>
      <p>size: {{ prettyBytes(props.cluster?.indices.store.size_in_bytes || 0) }}</p>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import prettyBytes from 'pretty-bytes';
import { CheckmarkOutline, WarningAlt, MisuseOutline } from '@vicons/carbon';
import { RawClusterStats } from '../../../store';

const props = defineProps<{ cluster: RawClusterStats | null }>();
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

  .cluster-status-color-green p:first-of-type {
    color: #36ad6a;
  }

  .cluster-status-color-yellow p:first-of-type {
    color: #f1c40f;
  }

  .cluster-status-color-red p:first-of-type {
    color: #e74c3c;
  }
}
</style>
