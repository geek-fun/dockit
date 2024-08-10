<template>
  <div class="manage-container">
    <tool-bar @switch-manage-tab="handleManageTabChange" />
    <cluster-state
      class="state-container"
      :cluster="cluster"
      v-if="activeTab === $t('manage.cluster')"
    />
    <node-state class="state-container" v-if="activeTab === $t('manage.nodes')" />
    <shared-manage class="state-container" v-if="activeTab === $t('manage.shards')" />
    <index-manage class="state-container" v-if="activeTab === $t('manage.indices')" />
  </div>
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import { useClusterManageStore, useConnectionStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import SharedManage from './components/shared-manage.vue';
import { lang } from '../../lang';
import IndexManage from './components/index-manage.vue';

const activeTab = ref(lang.global.t('manage.cluster'));

const connectionStore = useConnectionStore();
const { established } = storeToRefs(connectionStore);

const clusterManageStore = useClusterManageStore();
const { fetchCluster, fetchIndices, fetchAliases, fetchNodes, fetchShards } = clusterManageStore;
const { cluster } = storeToRefs(clusterManageStore);

watch(established, async () => {
  await Promise.all([fetchCluster(), fetchIndices(), fetchAliases(), fetchNodes(), fetchShards()]);
});

const handleManageTabChange = (tab: string) => {
  activeTab.value = tab;
};
fetchCluster().catch(() => {});
</script>

<style lang="scss" scoped>
.manage-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

  .state-container {
    flex: 1;
    height: 0;
  }
}
</style>
