<template>
  <div class="manage-container">
    <tool-bar type="MANAGE" @switch-manage-tab="handleManageTabChange" />
    <template v-if="connection?.type === DatabaseType.ELASTICSEARCH">
      <cluster-state
        v-if="activeTab === $t('manage.cluster')"
        class="state-container"
        :cluster="cluster"
      />
      <node-state v-if="activeTab === $t('manage.nodes')" class="state-container" />
      <shard-manage v-if="activeTab === $t('manage.shards')" class="state-container" />
      <index-manage v-if="activeTab === $t('manage.indices')" class="state-container" />
    </template>
    <template v-else-if="connection?.type === DatabaseType.DYNAMODB">
      <dynamo-table-manage class="state-container" />
    </template>
    <div v-else class="empty-state">
      <n-empty :description="$t('manage.emptyNoConnection')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolBar from '../../components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import DynamoTableManage from './components/dynamo-table-manage.vue';
import { useClusterManageStore, DatabaseType, useTabStore } from '../../store';
import { storeToRefs } from 'pinia';
import NodeState from './components/node-state.vue';
import ShardManage from './components/shard-manage.vue';
import { useLang } from '../../lang';
import IndexManage from './components/index-manage.vue';
import { CustomError } from '../../common';

const message = useMessage();
const lang = useLang();

const activeTab = ref(lang.t('manage.cluster'));

const tabStore = useTabStore();
const { activeConnection } = storeToRefs(tabStore);

const clusterManageStore = useClusterManageStore();
const { setConnection, refreshStates } = clusterManageStore;
const { cluster, connection } = storeToRefs(clusterManageStore);

const refreshData = async () => {
  try {
    refreshStates();
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
  const selectedConnection = connection.value ?? activeConnection.value;
  if (!selectedConnection) {
    message.warning(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }

  setConnection(selectedConnection);
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
