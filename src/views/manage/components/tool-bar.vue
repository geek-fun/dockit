<template>
  <div class="tool-bar-container">
    <div class="tool-bar-selector">
      <n-select
        :options="connectionOptions"
        :placeholder="$t('connection.selectConnection')"
        remote
        filterable
        :default-value="established?.name"
        :loading="connectionLoadingRef"
        @update:show="handleConnectionOpen"
        @update:value="handleConnectionUpdate"
      />
    </div>
    <n-tabs
      class="manage-container"
      type="line"
      animated
      justify-content="end"
      @update:value="handleManageTabChange"
    >
      <n-tab-pane :name="$t('manage.cluster')" :tab="$t('manage.cluster')" />
      <n-tab-pane :name="$t('manage.nodes')" :tab="$t('manage.nodes')" />
      <n-tab-pane :name="$t('manage.shards')" :tab="$t('manage.shards')" />
      <n-tab-pane :name="$t('manage.indices')" :tab="$t('manage.indices')" />
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useClusterManageStore, useConnectionStore } from '../../../store';
import { CustomError } from '../../../common';

const message = useMessage();

const connectionStore = useConnectionStore();
const { established, connections } = storeToRefs(connectionStore);
const { fetchConnections, establishConnection } = connectionStore;

const clusterManageStore = useClusterManageStore();
const { fetchCluster } = clusterManageStore;

const connectionLoadingRef = ref(false);

const emits = defineEmits(['switch-manage-tab']);

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const handleConnectionOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  connectionLoadingRef.value = true;
  await fetchConnections();
  connectionLoadingRef.value = false;
};

const handleConnectionUpdate = async (connectionName: string) => {
  const connection = connections.value.find(({ name }) => name === connectionName);
  if (!connection) {
    return;
  }
  try {
    await establishConnection(connection);
    await fetchCluster();
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 36000000,
    });
  }
};

const handleManageTabChange = (tabName: string) => {
  emits('switch-manage-tab', tabName);
};
</script>

<style lang="scss" scoped>
.tool-bar-container {
  height: var(--tool-bar-height);
  width: 100%;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);

  .tool-bar-selector {
    height: 100%;

    :deep(.n-select) {
      .n-base-selection {
        .n-base-selection-label {
          background-color: unset;
        }

        .n-base-selection__border,
        .n-base-selection__state-border {
          border: unset;
        }
      }

      .n-base-selection:hover,
      .n-base-selection--active,
      .n-base-selection--focus {
        .n-base-selection__state-border {
          border: unset;
          box-shadow: unset;
        }
      }
    }
  }

  .manage-container {
    margin-right: 10px;
    height: 100%;
  }
}
</style>
