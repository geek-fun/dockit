<template>
  <div class="manage-container">
    <n-card>
      <p class="cluster-cluster-box">
        <span>{{ $t('manage.cluster') }}</span>
        <n-icon size="28"><CheckmarkOutline /></n-icon>
      </p>
      <p>name: {{ props.cluster?.name }}</p>
      <p>id: {{ props.cluster?.id }}</p>
    </n-card>
    <n-card>
      <p>{{ $t('manage.nodes') }}</p>
      <p>name: {{ props.cluster?.name }}</p>
      <p>id: {{ props.cluster?.name }}</p>
    </n-card>
    <n-card>
      {{ $t('manage.shards') }}
      xxxx
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { CheckmarkOutline } from '@vicons/carbon';
import { Connection } from '../../../store';

const props = defineProps<{ cluster: Connection | null }>();
</script>

<style lang="scss" scoped>
.manage-container {
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  margin-top: 10px;

  .n-card {
    max-width: 300px;
    .cluster-cluster-box {
      color: #36ad6a;
      height: 28px;
      font-size: 28px;
      font-weight: bold;
      span {
        height: 100%;
        line-height: 2;

        margin-right: 10px;
      }
    }
  }
}
</style>
