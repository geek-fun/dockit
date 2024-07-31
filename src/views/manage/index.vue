<template>
  <div class="manage-container">
    <tool-bar @switch-manage-tab="handleManageTabChange" />
    <cluster-state
      class="state-container"
      :cluster="established?.rawClusterState || null"
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
import { useConnectionStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import SharedManage from './components/shared-manage.vue';
import { lang } from '../../lang';
import IndexManage from './components/index-manage.vue';
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
