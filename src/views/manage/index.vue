<template>
  <div class="manage-container">
    <tool-bar type="MANAGE" @switch-manage-tab="handleManageTabChange" />
    <template v-if="connection?.type === DatabaseType.ELASTICSEARCH">
      <cluster-state
        class="state-container"
        :cluster="cluster"
        v-if="activeTab === $t('manage.cluster')"
      />
      <node-state class="state-container" v-if="activeTab === $t('manage.nodes')" />
      <shared-manage class="state-container" v-if="activeTab === $t('manage.shards')" />
      <index-manage class="state-container" v-if="activeTab === $t('manage.indices')" />
    </template>
    <div v-else-if="connection" class="empty-state">
      <n-empty :description="$t('manage.emptyDynamodb')" />
    </div>
    <div v-else class="empty-state">
      <n-empty :description="$t('manage.emptyNoConnection')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolBar from '../../components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import { useClusterManageStore, DatabaseType, useTabStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import SharedManage from './components/shared-manage.vue';
import { useLang } from '../../lang';
import IndexManage from './components/index-manage.vue';
import { CustomError } from '../../common';

const message = useMessage();
const lang = useLang();

const activeTab = ref(lang.t('manage.cluster'));

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const clusterManageStore = useClusterManageStore();
const { setConnection, fetchCluster, fetchIndices, fetchAliases, fetchNodes, fetchShards } =
  clusterManageStore;
const { cluster, connection } = storeToRefs(clusterManageStore);

const refreshData = async () => {
  try {
    await fetchCluster();
    await fetchIndices();
    await fetchAliases();
    await fetchNodes();
    await fetchShards();
  } catch (err) {
    const { status, details } = err as CustomError;
    message.error(`status: ${status}, details: ${details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  }
};

watch(connection, async () => {
  await refreshData();
});

const handleManageTabChange = (tab: string) => {
  activeTab.value = tab;
};

onMounted(async () => {
  if (!activeConnection.value) {
    message.warning(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }
  setConnection(activeConnection.value);
  if (activeConnection.value?.type === DatabaseType.ELASTICSEARCH) {
    await refreshData();
  }
});
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

  .empty-state {
    flex: 1;
    height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
