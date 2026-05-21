<template>
  <div class="manage-container">
    <tool-bar
      type="MANAGE"
      @refresh-dynamo-manage="handleDynamoRefresh"
      @create-dynamo-table="handleCreateDynamoTable"
      @refresh-mongo-manage="handleMongoRefresh"
      @create-mongo-database="handleCreateMongoDatabase"
    />
    <template v-if="connection && isSearchConnection(connection)">
      <cluster-state class="state-container" :cluster="cluster" />
    </template>
    <template v-else-if="connection?.type === DatabaseType.DYNAMODB">
      <dynamo-table-manage ref="dynamoTableManageRef" class="state-container" />
    </template>
    <template v-else-if="connection?.type === DatabaseType.MONGODB">
      <mongo-cluster-state class="cluster-container" />
      <mongo-collection-manage ref="mongoCollectionManageRef" class="state-container" />
    </template>
    <div v-else class="empty-state">
      <Empty :description="$t('manage.emptyNoConnection')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ToolBar from '../../components/tool-bar.vue';
import ClusterState from './components/cluster-state.vue';
import DynamoTableManage from './components/dynamo-table-manage.vue';
import MongoCollectionManage from './components/mongo-collection-manage.vue';
import MongoClusterState from './components/mongo-cluster-state.vue';
import { useClusterManageStore, DatabaseType, useTabStore, isSearchConnection } from '../../store';
import { storeToRefs } from 'pinia';
import { useLang } from '../../lang';
import { CustomError } from '../../common';
import { useMessageService } from '@/composables';
import { Empty } from '@/components/ui/empty';

const message = useMessageService();
const lang = useLang();

const dynamoTableManageRef = ref<{
  handleRefresh: () => Promise<void>;
  showCreateTable: () => void;
}>();

const mongoCollectionManageRef = ref<{
  handleRefresh: () => Promise<void>;
  showCreateDatabase: () => void;
}>();

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

const handleDynamoRefresh = () => {
  dynamoTableManageRef.value?.handleRefresh();
};

const handleCreateDynamoTable = () => {
  dynamoTableManageRef.value?.showCreateTable();
};

const handleMongoRefresh = () => {
  mongoCollectionManageRef.value?.handleRefresh();
};

const handleCreateMongoDatabase = () => {
  mongoCollectionManageRef.value?.showCreateDatabase();
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
  if (activeConnection.value && isSearchConnection(activeConnection.value)) {
    await refreshData();
  }
});
</script>

<style scoped>
.manage-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

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
</style>
