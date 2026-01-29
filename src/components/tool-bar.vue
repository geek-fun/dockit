<template>
  <div class="tool-bar-container">
    <Select
      :model-value="connectionSelectValue"
      @update:model-value="value => handleUpdate(value as string, 'CONNECTION')"
      @update:open="isOpen => handleOpen(isOpen, 'CONNECTION')"
    >
      <SelectTrigger class="connection-select">
        <input
          v-if="selectionState.connection"
          ref="connectionSearchInput"
          v-model="filterRef.connection"
          class="select-trigger-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="connectionSelectValue || $t('connection.selectConnection')"
          @click.stop
        />
        <span v-else-if="connectionSelectValue" class="select-value-text">
          {{ connectionSelectValue }}
        </span>
        <span v-else class="select-placeholder-text">{{ $t('connection.selectConnection') }}</span>
        <SelectValue class="sr-only" :placeholder="$t('connection.selectConnection')" />
        <template #icon>
          <span v-if="selectionState.connection" class="i-carbon-search h-4 w-4 opacity-50" />
          <span v-else class="i-carbon-chevron-down h-4 w-4 opacity-50" />
        </template>
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in options.connection" :key="option.value" :value="option.value">
          {{ option.label }}
        </SelectItem>
        <div v-if="loadingRef.connection" class="select-loading">Loading...</div>
      </SelectContent>
    </Select>

    <Select
      v-if="props.type === 'ES_EDITOR'"
      :model-value="indexSelectValue"
      @update:model-value="value => handleUpdate(value as string, 'INDEX')"
      @update:open="isOpen => handleOpen(isOpen, 'INDEX')"
    >
      <SelectTrigger class="index-select">
        <input
          v-if="selectionState.index"
          ref="indexSearchInput"
          v-model="filterRef.index"
          class="select-trigger-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          :placeholder="indexSelectValue || $t('connection.selectIndex')"
          @click.stop
        />
        <span v-else-if="indexSelectValue" class="select-value-text">{{ indexSelectValue }}</span>
        <span v-else class="select-placeholder-text">{{ $t('connection.selectIndex') }}</span>
        <SelectValue class="sr-only" :placeholder="$t('connection.selectIndex')" />
        <template #icon>
          <span v-if="selectionState.index" class="i-carbon-search h-4 w-4 opacity-50" />
          <span v-else class="i-carbon-chevron-down h-4 w-4 opacity-50" />
        </template>
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in options.index" :key="option.value" :value="option.value">
          {{ option.label }}
        </SelectItem>
        <div v-if="loadingRef.index" class="select-loading">Loading...</div>
      </SelectContent>
    </Select>

    <TooltipProvider
      v-if="props.type === 'ES_EDITOR' || (props.type === 'MANAGE' && isElasticsearchConnection)"
    >
      <Tooltip>
        <TooltipTrigger as-child>
          <div class="switch-container">
            <Switch
              :checked="hideSystemIndicesRef"
              class="action-index-switch"
              @update:checked="handleHiddenChange"
            />
            <Label class="switch-label">{{ hideSystemIndicesRef ? 'Hidden' : 'Display' }}</Label>
          </div>
        </TooltipTrigger>
        <TooltipContent>Hide/Display system indices</TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <DropdownMenu v-if="props.type === 'ES_EDITOR'">
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="sample-btn">
          <span class="i-carbon-code mr-1 h-4 w-4" />
          {{ $t('editor.sampleQueries') }}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <template v-for="option in esSampleQueryOptions" :key="option.key">
          <DropdownMenuSeparator v-if="option.type === 'divider'" />
          <DropdownMenuItem v-else @click="handleEsSampleSelect(option.key)">
            {{ option.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <div v-if="props.type === 'DYNAMO_EDITOR'" class="button-group">
      <Button
        :variant="activePanel.editorType === 'DYNAMO_EDITOR_UI' ? 'default' : 'ghost'"
        size="sm"
        class="button-group-first"
        @click="handleEditorSwitch('DYNAMO_EDITOR_UI')"
      >
        <span class="i-carbon-template mr-1 h-4 w-4" />
        {{ $t('editor.dynamo.uiQuery') }}
      </Button>
      <Button
        :variant="activePanel.editorType === 'DYNAMO_EDITOR_SQL' ? 'default' : 'ghost'"
        size="sm"
        class="button-group-middle"
        @click="handleEditorSwitch('DYNAMO_EDITOR_SQL')"
      >
        <span class="i-carbon-code mr-1 h-4 w-4" />
        {{ $t('editor.dynamo.sqlEditor') }}
      </Button>
      <Button
        :variant="activePanel.editorType === 'DYNAMO_EDITOR_CREATE_ITEM' ? 'default' : 'ghost'"
        size="sm"
        class="button-group-last"
        @click="handleEditorSwitch('DYNAMO_EDITOR_CREATE_ITEM')"
      >
        <span class="i-carbon-add mr-1 h-4 w-4" />
        {{ $t('editor.dynamo.createItem') }}
      </Button>
    </div>

    <DropdownMenu
      v-if="props.type === 'DYNAMO_EDITOR' && activePanel.editorType === 'DYNAMO_EDITOR_SQL'"
    >
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" class="sample-btn">
          <span class="i-carbon-code mr-1 h-4 w-4" />
          {{ $t('editor.dynamo.partiql.samples') }}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          v-for="option in partiqlSampleQueryOptions"
          :key="option.key"
          @click="handlePartiqlSampleSelect(option.key)"
        >
          {{ option.label }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <div
      v-if="props.type === 'DYNAMO_EDITOR' && activePanel.editorType === 'DYNAMO_EDITOR_SQL'"
      class="run-button-container"
    >
      <Button
        size="sm"
        :disabled="!activePanel.connection || isExecuting"
        @click="handleExecuteQuery"
      >
        <span class="i-carbon-play-filled-alt mr-1 h-4 w-4" />
        {{ isExecuting ? 'Executing...' : $t('dialogOps.execute') }}
      </Button>
    </div>

    <Button
      v-if="props.type === 'MANAGE' && connection?.type === DatabaseType.DYNAMODB"
      variant="outline"
      size="sm"
      @click="handleDynamoRefresh"
    >
      <span class="i-carbon-renew mr-1 h-4 w-4" />
      {{ $t('manage.dynamo.refresh') }}
    </Button>

    <Tabs
      v-if="props.type === 'MANAGE' && isElasticsearchConnection"
      :default-value="$t('manage.cluster')"
      class="manage-container"
      @update:model-value="handleManageTabChange"
    >
      <TabsList>
        <TabsTrigger :value="$t('manage.cluster')">{{ $t('manage.cluster') }}</TabsTrigger>
        <TabsTrigger :value="$t('manage.nodes')">{{ $t('manage.nodes') }}</TabsTrigger>
        <TabsTrigger :value="$t('manage.shards')">{{ $t('manage.shards') }}</TabsTrigger>
        <TabsTrigger :value="$t('manage.indices')">{{ $t('manage.indices') }}</TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import {
  useClusterManageStore,
  useConnectionStore,
  useTabStore,
  DatabaseType,
  ElasticsearchConnection,
} from '../store';
import { useLang } from '../lang';
import { CustomError } from '../common';
import { esSampleQueries } from '../common/monaco';
import { useMessageService } from '@/composables';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const props = defineProps({ type: String });
const emits = defineEmits([
  'switch-manage-tab',
  'insert-sample-query',
  'insert-partiql-sample',
  'execute-partiql-query',
  'refresh-dynamo-manage',
]);

const message = useMessageService();
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

// Check if connection is Elasticsearch type
const isElasticsearchConnection = computed(() => {
  return connection.value?.type === DatabaseType.ELASTICSEARCH;
});

const loadingRef = ref({ connection: false, index: false });

const filterRef = ref({ connection: '', index: '' });
const connectionSearchInput = ref<HTMLInputElement>();
const indexSearchInput = ref<HTMLInputElement>();

const selectionState = ref<{ connection: boolean; index: boolean }>({
  connection: false,
  index: false,
});

const hideSystemIndicesRef = ref(true);
const isExecuting = ref(false);

const connectionSelectValue = computed(() => {
  return ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
    ? activePanel?.value?.connection?.name
    : connection?.value?.name;
});

const indexSelectValue = computed(() => {
  const conn = activePanel?.value?.connection;
  if (conn && conn.type === DatabaseType.ELASTICSEARCH) {
    return (conn as ElasticsearchConnection).activeIndex?.index;
  }
  return undefined;
});

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
          ({ name }) =>
            !filterRef.value.connection ||
            name.toLowerCase().includes(filterRef.value.connection.toLowerCase()),
        )
        .map(({ name }) => ({ label: name, value: name })),
      index: activeElasticsearchIndexOption.value
        ?.filter(index => (hideSystemIndicesRef.value ? !index.value.startsWith('.') : true))
        .filter(
          index =>
            !filterRef.value.index ||
            index.value.toLowerCase().includes(filterRef.value.index.toLowerCase()),
        ),
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

  // Focus search input after state update
  setTimeout(() => {
    if (type === 'CONNECTION' && connectionSearchInput.value) {
      connectionSearchInput.value.focus();
    } else if (type === 'INDEX' && indexSearchInput.value) {
      indexSearchInput.value.focus();
    }
  }, 0);

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

const handleManageTabChange = (tabName: string | number) => {
  emits('switch-manage-tab', String(tabName));
};

const handleDynamoRefresh = () => {
  emits('refresh-dynamo-manage');
};

const handleHiddenChange = async (value: boolean) => {
  hideSystemIndicesRef.value = value;
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

<style scoped>
.tool-bar-container {
  width: 100%;
  height: 35px;
  line-height: 40px;
  display: flex;
  align-items: center;
  margin: 0;
  padding: 0;
  justify-content: flex-start;
  border-right: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.sample-btn {
  margin-left: 10px;
}

.run-button-container {
  margin-left: auto;
  margin-right: 10px;
  display: flex;
  align-items: center;
}

.switch-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 10px;
  cursor: pointer;
}

.switch-label {
  font-size: 12px;
  min-width: 50px;
}

.manage-container {
  margin-left: auto;
  margin-right: 10px;
}

.connection-select {
  margin: 0;
  padding: 0 12px;
  height: 35px;
  max-width: 300px;
  min-width: 200px;
  border: none;
  border-right: 1px solid hsl(var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.connection-select:focus {
  outline: none;
  ring: 0;
  box-shadow: none;
}

.index-select {
  margin: 0;
  padding: 0 12px;
  height: 35px;
  max-width: 300px;
  min-width: 200px;
  border: none;
  border-right: 1px solid hsl(var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.index-select:focus {
  outline: none;
  ring: 0;
  box-shadow: none;
}

.select-search-container {
  padding: 8px;
  border-bottom: 1px solid hsl(var(--border));
}

.select-search-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  font-size: 14px;
  background: hsl(var(--background));
  color: inherit;
}

.select-search-input:focus {
  outline: none;
  border-color: hsl(var(--primary));
}

.select-loading {
  padding: 8px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.button-group {
  display: flex;
  gap: 0;
  margin-left: 10px;
}

.button-group-first {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.button-group-middle {
  border-radius: 0;
}

.button-group-last {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.mr-1 {
  margin-right: 4px;
}

.select-value-text {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-trigger-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-size: 14px;
  padding: 0;
  width: 100%;
}

.select-trigger-input::placeholder {
  color: hsl(var(--muted-foreground));
}

.select-placeholder-text {
  flex: 1;
  text-align: left;
  color: hsl(var(--muted-foreground));
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
