<template>
  <div class="manage-container">
    <tool-bar @switch-manage-tab="handleManageTabChange" />
    <cluster-state
      class="state-container"
      :cluster="established?.rawClusterState as RawClusterStats"
      v-if="activeTab === $t('manage.cluster')"
    />
    <node-state class="state-container" v-if="activeTab === $t('manage.nodes')" />
  </div>
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import { RawClusterStats, useConnectionStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import { lang } from '../../lang';
const activeTab = ref(lang.global.t('manage.cluster'));

const connectionStore = useConnectionStore();
const { fetchClusterState } = connectionStore;

const { established } = storeToRefs(connectionStore);
const handleManageTabChange = (tab: string) => {
  activeTab.value = tab;
};
fetchClusterState();
</script>

<style lang="scss" scoped>
.manage-container {
  display: flex;
  flex-direction: column;
  .state-container {
    flex: 1;
    height: 0;
  }
}
</style>
