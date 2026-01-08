<template>
  <div class="tool-bar-container">
    <n-select
      :options="options.connection"
      :placeholder="$t('connection.selectConnection')"
      :input-props="inputProps"
      remote
      filterable
      :default-value="
        ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
          ? activePanel?.connection?.name
          : connection?.name
      "
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
      v-if="props.type === 'ES_EDITOR'"
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
    <n-tooltip trigger="hover" v-if="['ES_EDITOR', 'MANAGE'].includes(props.type ?? '')">
      <template #trigger>
        <n-switch
          :round="false"
          v-model:value="hideSystemIndicesRef"
          class="action-index-switch"
          @update:value="handleHiddenChange"
        >
          <template #checked> Hidden</template>
          <template #unchecked>Display</template>
        </n-switch>
      </template>
      Hide/Display system indices
    </n-tooltip>

    <n-dropdown
      v-if="props.type === 'ES_EDITOR'"
      trigger="click"
      :options="esSampleQueryOptions"
      @select="handleEsSampleSelect"
    >
      <n-button quaternary size="small" class="sample-btn">
        <template #icon>
          <n-icon><Code /></n-icon>
        </template>
        {{ $t('editor.sampleQueries') }}
      </n-button>
    </n-dropdown>

    <n-button-group v-if="props.type === 'DYNAMO_EDITOR'">
      <n-button
        :quaternary="activePanel.editorType !== 'DYNAMO_EDITOR_UI'"
        :type="activePanel.editorType === 'DYNAMO_EDITOR_UI' ? 'primary' : 'default'"
        @click="handleEditorSwitch('DYNAMO_EDITOR_UI')"
      >
        <template #icon>
          <n-icon>
            <Template />
          </n-icon>
        </template>
        {{ $t('editor.dynamo.uiQuery') }}
      </n-button>
      <n-button
        :quaternary="activePanel.editorType !== 'DYNAMO_EDITOR_SQL'"
        :type="activePanel.editorType === 'DYNAMO_EDITOR_SQL' ? 'primary' : 'default'"
        @click="handleEditorSwitch('DYNAMO_EDITOR_SQL')"
      >
        <template #icon>
          <n-icon>
            <Code />
          </n-icon>
        </template>
        {{ $t('editor.dynamo.sqlEditor') }}
      </n-button>
      <n-button
        :quaternary="activePanel.editorType !== 'DYNAMO_EDITOR_CREATE_ITEM'"
        :type="activePanel.editorType === 'DYNAMO_EDITOR_CREATE_ITEM' ? 'primary' : 'default'"
        @click="handleEditorSwitch('DYNAMO_EDITOR_CREATE_ITEM')"
      >
        <template #icon>
          <n-icon>
            <Add />
          </n-icon>
        </template>
        {{ $t('editor.dynamo.createItem') }}
      </n-button>
    </n-button-group>

    <n-dropdown
      v-if="props.type === 'DYNAMO_EDITOR' && activePanel.editorType === 'DYNAMO_EDITOR_SQL'"
      trigger="click"
      :options="partiqlSampleQueryOptions"
      @select="handlePartiqlSampleSelect"
    >
      <n-button quaternary size="small" class="sample-btn">
        <template #icon>
          <n-icon><Code /></n-icon>
        </template>
        {{ $t('editor.dynamo.partiql.samples') }}
      </n-button>
    </n-dropdown>

    <div v-if="props.type === 'DYNAMO_EDITOR' && activePanel.editorType === 'DYNAMO_EDITOR_SQL'" class="run-button-container">
      <n-button
        type="primary"
        size="small"
        @click="handleExecuteQuery"
        :loading="isExecuting"
        :disabled="!activePanel.connection"
      >
        <template #icon>
          <n-icon><PlayFilledAlt /></n-icon>
        </template>
        {{ $t('dialogOps.execute') }}
      </n-button>
    </div>

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
import { Add, Search, Code, Template, PlayFilledAlt } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { useClusterManageStore, useConnectionStore, useTabStore } from '../store';
import { useLang } from '../lang';
import { CustomError, inputProps } from '../common';
import { esSampleQueries, partiqlSampleQueries } from '../common/monaco';

const props = defineProps({ type: String });
const emits = defineEmits(['switch-manage-tab', 'insert-sample-query', 'insert-partiql-sample', 'execute-partiql-query']);

const message = useMessage();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, selectIndex } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { selectConnection } = tabStore;
const { activePanel, activeElasticsearchIndexOption } = storeToRefs(tabStore);

const clusterManageStore = useClusterManageStore();
const { setConnection, refreshStates } = clusterManageStore;
const { connection, hideSystemIndices } = storeToRefs(clusterManageStore);

const loadingRef = ref({ connection: false, index: false });

const filterRef = ref({ connection: '', index: '' });
const selectionState = ref<{ connection: boolean; index: boolean }>({
  connection: false,
  index: false,
});

const hideSystemIndicesRef = ref(true);
const isExecuting = ref(false);

const esSampleQueryOptions = computed(() => [
  { label: lang.t('editor.es.sampleClusterHealth'), key: 'clusterHealth' },
  { label: lang.t('editor.es.sampleClusterStats'), key: 'clusterStats' },
  { label: lang.t('editor.es.sampleCatIndices'), key: 'catIndices' },
  { label: lang.t('editor.es.sampleNodesInfo'), key: 'nodesInfo' },
  { type: 'divider', key: 'd1' },
  { label: lang.t('editor.es.sampleSearch'), key: 'search' },
  { label: lang.t('editor.es.sampleMatchSearch'), key: 'matchSearch' },
  { label: lang.t('editor.es.sampleCount'), key: 'count' },
  { type: 'divider', key: 'd2' },
  { label: lang.t('editor.es.sampleCreateIndex'), key: 'createIndex' },
  { label: lang.t('editor.es.sampleDeleteIndex'), key: 'deleteIndex' },
  { label: lang.t('editor.es.sampleGetMapping'), key: 'getMapping' },
  { label: lang.t('editor.es.samplePutMapping'), key: 'putMapping' },
  { type: 'divider', key: 'd3' },
  { label: lang.t('editor.es.sampleIndexDocument'), key: 'indexDocument' },
  { label: lang.t('editor.es.sampleGetDocument'), key: 'getDocument' },
  { label: lang.t('editor.es.sampleUpdateDocument'), key: 'updateDocument' },
  { label: lang.t('editor.es.sampleDeleteDocument'), key: 'deleteDocument' },
  { label: lang.t('editor.es.sampleBulk'), key: 'bulkOperation' },
]);

const partiqlSampleQueryOptions = computed(() => [
  {
    label: lang.t('editor.dynamo.partiql.sampleSelectPk'),
    key: 'selectWithPartitionKey',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleSelectSk'),
    key: 'selectWithSortKey',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleScan'),
    key: 'scanAll',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleInsert'),
    key: 'insertItem',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleUpdate'),
    key: 'updateItem',
  },
  {
    label: lang.t('editor.dynamo.partiql.sampleDelete'),
    key: 'deleteItem',
  },
]);

const handleEsSampleSelect = (key: string) => {
  const query = esSampleQueries[key as keyof typeof esSampleQueries];
  if (query) {
    emits('insert-sample-query', query);
  }
};

const handlePartiqlSampleSelect = (key: string) => {
  emits('insert-partiql-sample', key);
};

const handleExecuteQuery = () => {
  emits('execute-partiql-query');
};

watch(
  () => props.type,
  async newType => {
    if (newType === 'ES_EDITOR') {
      hideSystemIndicesRef.value = activePanel?.value.hideSystemIndices ?? true;
    } else if (newType === 'MANAGE') {
      if (!connection.value && activePanel.value.connection) {
        setConnection(activePanel.value.connection);
      }
      hideSystemIndicesRef.value = hideSystemIndices.value;
    }
  },
  { immediate: true },
);

const options = computed(
  () =>
    ({
      connection: connections.value
        .filter(
          ({ name }) => !filterRef.value.connection || name.includes(filterRef.value.connection),
        )
        .map(({ name }) => ({ label: name, value: name })),
      index: activeElasticsearchIndexOption.value
        ?.filter(index => (hideSystemIndicesRef.value ? !index.value.startsWith('.') : true))
        .filter(index => !filterRef.value.index || index.value.includes(filterRef.value.index)),
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
    let selectedConnection = ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
      ? activePanel.value.connection
      : connection.value;
    if (!selectedConnection) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    loadingRef.value.index = true;
    try {
      await fetchIndices(selectedConnection);
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
    const con = connections.value.find(({ name }) => name === value);
    if (!con) {
      return;
    }
    try {
      if (['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')) {
        await selectConnection(con);
      } else {
        setConnection(con);
      }
    } catch (err) {
      const error = err as CustomError;
      message.error(`status: ${error.status}, details: ${error.details}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
  } else {
    const selectedConnection = ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
      ? activePanel.value.connection
      : connection.value;
    if (!selectedConnection) {
      message.error(lang.t('editor.establishedRequired'), {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      });
      return;
    }
    selectIndex(selectedConnection, value);
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

const handleHiddenChange = async (value: boolean) => {
  if (props.type === 'ES_EDITOR' && activePanel.value) {
    activePanel.value.hideSystemIndices = value;
  }
  if (props.type === 'MANAGE' && connection.value) {
    await refreshStates(value);
  }
};

const handleEditorSwitch = async (
  value: 'DYNAMO_EDITOR_UI' | 'DYNAMO_EDITOR_SQL' | 'DYNAMO_EDITOR_CREATE_ITEM',
) => {
  activePanel.value.editorType = value;
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

  .sample-btn {
    margin-left: 10px;
  }

  .run-button-container {
    margin-left: auto;
    margin-right: 10px;
    display: flex;
    align-items: center;
  }

  .action-index-switch {
    cursor: pointer;
    padding: 0;
    margin-left: 10px;
    height: inherit;
    min-width: 80px;
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
