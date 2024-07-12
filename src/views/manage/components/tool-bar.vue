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
      <n-select
        :options="indexOptions"
        :placeholder="$t('connection.selectIndex')"
        remote
        filterable
        :default-value="established?.activeIndex?.index"
        :loading="indexLoadingRef"
        @update:value="selectIndex"
        @update:show="handleIndexOpen"
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
import { useConnectionStore } from '../../../store';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';
const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { establishedIndexNames, established, connections } = storeToRefs(connectionStore);
const { fetchIndices, fetchConnections, selectIndex, establishConnection } = connectionStore;

const indexLoadingRef = ref(false);
const connectionLoadingRef = ref(false);

const emits = defineEmits(['switch-manage-tab']);

// build options list
const indexOptions = computed(() =>
  establishedIndexNames.value.map(name => ({ label: name, value: name })),
);

const connectionOptions = computed(() =>
  connections.value.map(({ name }) => ({ label: name, value: name })),
);

const handleIndexOpen = async (isOpen: boolean) => {
  if (!isOpen) return;
  if (!established.value) {
    message.error(lang.t('editor.establishedRequired'), {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
    return;
  }
  indexLoadingRef.value = true;
  await fetchIndices();
  indexLoadingRef.value = false;
};

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
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
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
