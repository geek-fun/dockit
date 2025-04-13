<template>
  <div class="tool-bar-container">
    <n-select
      :options="options.connection"
      :placeholder="$t('connection.selectConnection')"
      :input-props="inputProps"
      remote
      filterable
      :default-value="activePanel?.connection?.name"
      :loading="loadingRef.connection"
      @update:show="isOpen => handleOpen(isOpen, 'CONNECTION')"
      @update:value="value => handleUpdate(value, 'CONNECTION')"
      @search="input => handleSearch(input, 'CONNECTION')"
    >
      <template v-if="selectionState.connection" #arrow>
        <Search />
      </template>
    </n-select>
    <n-select
      v-if="props.type === 'EDITOR'"
      :options="options.index"
      :placeholder="$t('connection.selectIndex')"
      :input-props="inputProps"
      remote
      filterable
      clearable
      :loading="loadingRef.index"
      @update:value="value => handleUpdate(value, 'INDEX')"
      @update:show="isOpen => handleOpen(isOpen, 'INDEX')"
      @search="input => handleSearch(input, 'INDEX')"
    >
      <template v-if="selectionState.index" #arrow>
        <Search />
      </template>
    </n-select>
    <n-tooltip v-if="props.type === 'EDITOR'" trigger="hover">
      <template #trigger>
        <n-icon size="20" class="action-load-icon" @click="loadDefaultSnippet">
          <AiStatus />
        </n-icon>
      </template>
      {{ $t('editor.loadDefault') }}
    </n-tooltip>
    <n-tabs
      v-if="props.type === 'MANAGE'"
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
import { AiStatus, Search } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { ElasticsearchConnection, useConnectionStore, useTabStore } from '../store';
import { useLang } from '../lang';
import { CustomError, inputProps } from '../common';

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, selectIndex } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const props = defineProps({
  type: String,
});
const emits = defineEmits(['switch-manage-tab']);

const tabStore = useTabStore();
const { loadDefaultSnippet,selectConnection } = tabStore;
const { activePanel } = storeToRefs(tabStore);

const loadingRef = ref({ connection: false, index: false });

const filterRef = ref({ connection: '', index: '' });
const selectionState = ref<{ connection: boolean; index: boolean }>({
  connection: false,
  index: false,
});
const options = computed(
  () =>
    ({
      connection: connections.value
        .filter(
          ({ name }) => !filterRef.value.connection || name.includes(filterRef.value.connection),
        )
        .map(({ name }) => ({ label: name, value: name })),
      index: (activePanel.value.connection as ElasticsearchConnection)?.indices
        .filter(index => !filterRef.value.index || index.index.includes(filterRef.value.index))
        .map(index => ({ label: index.index, value: index.index })),
    }) as Record<string, { label: string; value: string }[]>,
);

const handleOpen = async (isOpen: boolean, type: 'CONNECTION' | 'INDEX') => {
  if (!isOpen) {
    // @ts-ignore
    selectionState.value[type.toLowerCase()] = false;
    return;
  }
  // @ts-ignore
  selectionState.value[type.toLowerCase()] = true;
  filterRef.value = { connection: '', index: '' }; // reset filters for each time it open
  if (type === 'CONNECTION') {
    loadingRef.value.connection = true;
    await fetchConnections();
    loadingRef.value.connection = false;
  } else {
    if (!activePanel.value.connection) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    loadingRef.value.index = true;
    try {
      await fetchIndices(activePanel.value.connection);
    } catch (err) {
      message.error(
        `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
        { closable: true, keepAliveOnHover: true, duration: 3000 },
      );
    }

    loadingRef.value.index = false;
  }
};

const handleUpdate = async (value: string, type: 'CONNECTION' | 'INDEX') => {
  if (type === 'CONNECTION') {
    const connection = connections.value.find(({ name }) => name === value);
    if (!connection) {
      return;
    }
    try {
      await selectConnection(connection);
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
  } else {
    if (!activePanel.value.connection) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    selectIndex(activePanel.value.connection, value);
  }
};

const handleSearch = async (input: string, type: 'CONNECTION' | 'INDEX') => {
  if (type === 'CONNECTION') {
    filterRef.value.connection = input;
  } else {
    filterRef.value.index = input;
  }
};

const handleManageTabChange = (tabName: string) => {
  emits('switch-manage-tab', tabName);
};
</script>

<style lang="scss" scoped>
.tool-bar-container {
  width: 100%;
  height: 35px;
  line-height: 40px;
  display: flex;
  margin: 0;
  padding: 0;
  justify-content: flex-start;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);

  .action-load-icon {
    cursor: pointer;
    padding: 0;
    margin-left: 10px;
    line-height: 40px;
  }

  .manage-container {
    margin-right: 10px;
  }

  :deep(.n-select) {
    margin: 0;
    padding: 0;
    max-width: 300px;
    border-right: 1px solid var(--border-color);

    .n-base-selection {
      .n-base-selection-label {
        height: unset;
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
</style>
