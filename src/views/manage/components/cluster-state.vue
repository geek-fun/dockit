<template>
  <div class="manage-state-container">
    <Card
      class="cluster-item-box cluster-cluster-box"
      :class="{
        'cluster-status-color-green': props.cluster?.status == 'green',
        'cluster-status-color-yellow': props.cluster?.status == 'yellow',
        'cluster-status-color-red': props.cluster?.status == 'red',
      }"
    >
      <CardContent class="pt-6">
        <p>
          <span>{{ $t('manage.cluster') }}</span>
          <span
            v-if="props.cluster?.status == 'green'"
            class="i-carbon-checkmark-outline h-6 w-6 ml-2 align-middle"
          />
          <span
            v-else-if="props.cluster?.status == 'yellow'"
            class="i-carbon-warning-alt h-6 w-6 ml-2 align-middle"
          />
          <span
            v-else-if="props.cluster?.status == 'red'"
            class="i-carbon-misuse-outline h-6 w-6 ml-2 align-middle"
          />
        </p>
        <p>name: {{ props.cluster?.cluster_name }}</p>
        <p>id: {{ props.cluster?.cluster_uuid }}</p>
        <p>version: {{ props.cluster?.nodes.versions }}</p>
      </CardContent>
    </Card>
    <Card class="cluster-item-box cluster-nodes-box">
      <CardContent class="pt-6">
        <p>{{ $t('manage.nodes') }}: {{ props.cluster?.nodes.count.total }}</p>
        <p>master: {{ props.cluster?.nodes.count.master }}</p>
        <p>data: {{ props.cluster?.nodes.count.data }}</p>
      </CardContent>
    </Card>
    <Card class="cluster-item-box cluster-shards-box">
      <CardContent class="pt-6">
        <p>{{ $t('manage.shards') }}: {{ props.cluster?.indices.shards.total }}</p>
        <p>primaries: {{ props.cluster?.indices.shards.primaries }}</p>
        <p>
          replicas:
          {{
            (props.cluster?.indices?.shards?.total || 0) -
            (props.cluster?.indices.shards?.primaries || 0)
          }}
        </p>
      </CardContent>
    </Card>
    <Card class="cluster-item-box cluster-indices-box">
      <CardContent class="pt-6">
        <p>{{ $t('manage.indices') }}: {{ props.cluster?.indices.count }}</p>
        <p>docs: {{ props.cluster?.indices.docs.count }}</p>
        <p>size: {{ prettyBytes(props.cluster?.indices.store.size_in_bytes || 0) }}</p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import prettyBytes from 'pretty-bytes';
import { RawClusterStats } from '../../../store';
import { Card, CardContent } from '@/components/ui/card';

const props = defineProps<{ cluster: RawClusterStats | undefined }>();
</script>

<style scoped>
.manage-state-container {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
}

.manage-state-container .cluster-item-box {
  margin-top: 10px;
  max-width: 300px;
  max-height: 300px;
}

.manage-state-container .cluster-item-box p:first-of-type {
  font-size: 28px;
  font-weight: bold;
  margin-block: 0;
  color: #2478ec;
}

.manage-state-container .cluster-cluster-box p:first-of-type {
  color: #36ad6a;
}

.manage-state-container .cluster-cluster-box p:first-of-type span {
  height: 100%;
  margin-right: 10px;
}

.manage-state-container .cluster-status-color-green p:first-of-type {
  color: #36ad6a;
}

.manage-state-container .cluster-status-color-yellow p:first-of-type {
  color: #f1c40f;
}

.manage-state-container .cluster-status-color-red p:first-of-type {
  color: #e74c3c;
}
</style>
