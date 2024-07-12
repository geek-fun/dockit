<template>
  <div class="manage-container">
    <tool-bar @switch-manage-tab="handleManageTabChange" />
    <cluster-state
      class="state-container"
      :cluster="established"
      v-if="activeTab === $t('manage.cluster')"
    />
    <node-state class="state-container" v-if="activeTab === $t('manage.nodes')" />
  </div>
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import { useConnectionStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import { lang } from '../../lang';
const activeTab = ref(lang.global.t('manage.cluster'));

const connectionStore = useConnectionStore();

const { established } = storeToRefs(connectionStore);

const handleManageTabChange = (tab: string) => {
  activeTab.value = tab;
};
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
