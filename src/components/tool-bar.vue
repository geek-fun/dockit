<template>
  <div class="tool-bar-container">
    <SearchableSelect
      :model-value="connectionSelectValue || ''"
      :options="connectionOptions"
      :loading="loadingRef.connection"
      :placeholder="$t('connection.selectConnection')"
      variant="ghost"
      :search-threshold="0"
      class="connection-select"
      @update:model-value="value => handleUpdate(value, 'CONNECTION')"
      @open="isOpen => handleOpen(isOpen, 'CONNECTION')"
    >
      <template #selected-prepend>
        <span
          v-if="credsExpiryIcon"
          class="inline-block h-3.5 w-3.5 mr-1 shrink-0 align-text-bottom"
          :class="credsExpiryIcon"
        />
      </template>
    </SearchableSelect>

    <SearchableSelect
      v-if="
        props.type === 'DYNAMO_EDITOR' || (props.type === 'MANAGE' && !isElasticsearchConnection)
      "
      :model-value="tableSelectValue || ''"
      :options="tableOptions"
      :loading="loadingRef.table"
      :placeholder="$t('connection.selectTable')"
      variant="ghost"
      :search-threshold="0"
      class="index-select"
      @update:model-value="value => handleUpdate(value, 'TABLE')"
      @open="isOpen => handleOpen(isOpen, 'TABLE')"
    >
      <template #option="{ option }">
        <span class="flex items-center gap-1 w-full">
          <span
            class="h-3.5 w-3.5 shrink-0 cursor-pointer"
            :class="
              option.favorite ? 'i-carbon-star-filled text-yellow-400' : 'i-carbon-star opacity-40'
            "
            @click.stop="toggleFavoriteTable(option.value)"
          />
          {{ option.label }}
        </span>
      </template>
    </SearchableSelect>

    <SearchableSelect
      v-if="props.type === 'ES_EDITOR'"
      :model-value="indexSelectValue || ''"
      :options="indexOptions"
      :loading="loadingRef.index"
      :placeholder="$t('connection.selectIndex')"
      variant="ghost"
      :search-threshold="0"
      class="index-select"
      @update:model-value="value => handleUpdate(value, 'INDEX')"
      @open="isOpen => handleOpen(isOpen, 'INDEX')"
    />

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
            <Label class="switch-label">
              {{ hideSystemIndicesRef ? $t('toolBar.hidden') : $t('toolBar.display') }}
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipContent>{{ $t('toolBar.hideSystemIndices') }}</TooltipContent>
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
      v-if="props.type === 'MANAGE' && connection?.type === DatabaseType.ELASTICSEARCH"
      variant="ghost"
      size="sm"
      :disabled="refreshLoading"
      @click="refreshStates"
    >
      <Loader2 v-if="refreshLoading" class="mr-1 h-4 w-4 animate-spin" />
      <span v-else class="i-carbon-renew mr-1 h-4 w-4" />
      {{ $t('manage.actions.refresh') }}
    </Button>

    <Button
      v-if="props.type === 'MANAGE' && connection?.type === DatabaseType.DYNAMODB"
      variant="ghost"
      size="sm"
      @click="handleDynamoRefresh"
    >
      <span class="i-carbon-renew mr-1 h-4 w-4" />
      {{ $t('manage.dynamo.refresh') }}
    </Button>

    <!-- Shortcuts Help Button for Editor contexts -->
    <div
      v-if="props.type === 'ES_EDITOR' || props.type === 'DYNAMO_EDITOR'"
      class="help-button-container"
      :class="{ 'push-right': !showRunButton }"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="sm" @click="showShortcutsDialog = !showShortcutsDialog">
              <span class="i-carbon-keyboard h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {{ $t('shortcuts.title') }}
            <span class="shortcut-hint">({{ cmdKey }}+Shift+/)</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ShortcutsHelpDialog v-model:open="showShortcutsDialog" :editor-type="props.type" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { platform } from '@tauri-apps/plugin-os';
import { storeToRefs } from 'pinia';
import { Loader2 } from 'lucide-vue-next';
import {
  useClusterManageStore,
  useConnectionStore,
  useTabStore,
  DatabaseType,
  ElasticsearchConnection,
  DynamoDBConnection,
} from '../store';
import { useLang } from '../lang';
import { CustomError } from '../common';
import { esSampleQueries } from '../common/monaco';
import { useMessageService } from '@/composables';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const props = defineProps({ type: { type: String, default: undefined } });
const emits = defineEmits([
  'insert-sample-query',
  'insert-partiql-sample',
  'execute-partiql-query',
  'refresh-dynamo-manage',
]);

const message = useMessageService();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, fetchIndices, fetchTables, selectIndex } = connectionStore;
const { connections } = storeToRefs(connectionStore);

const tabStore = useTabStore();
const { selectConnection, setActiveTable, toggleFavoriteTable } = tabStore;
const { activePanel, activeElasticsearchIndexOption } = storeToRefs(tabStore);

const clusterManageStore = useClusterManageStore();
const { setConnection, refreshStates } = clusterManageStore;
const { connection, hideSystemIndices, refreshLoading } = storeToRefs(clusterManageStore);

// Check if connection is Elasticsearch type
const isElasticsearchConnection = computed(() => {
  return connection.value?.type === DatabaseType.ELASTICSEARCH;
});

// Check if run button is visible (DynamoDB SQL editor) — used to avoid margin conflict
const showRunButton = computed(() => {
  return props.type === 'DYNAMO_EDITOR' && activePanel.value.editorType === 'DYNAMO_EDITOR_SQL';
});

const loadingRef = ref({ connection: false, index: false, table: false });

const hideSystemIndicesRef = ref(true);
const isExecuting = ref(false);
const showShortcutsDialog = ref(false);

// Called by parent when editor emits toggle-shortcuts-dialog
const toggleShortcutsDialog = () => {
  showShortcutsDialog.value = !showShortcutsDialog.value;
};

defineExpose({ toggleShortcutsDialog });

// Platform-aware key display for shortcuts hint
const cmdKey = computed(() => {
  try {
    return platform() === 'macos' ? '⌘' : 'Ctrl';
  } catch {
    return 'Ctrl';
  }
});

const connectionSelectValue = computed(() => {
  return ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
    ? activePanel?.value?.connection?.name
    : connection?.value?.name;
});

const currentDynamoConn = computed<DynamoDBConnection | undefined>(() => {
  const conn = ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
    ? activePanel?.value?.connection
    : connection?.value;
  return conn?.type === DatabaseType.DYNAMODB ? (conn as DynamoDBConnection) : undefined;
});

const credsExpiryIcon = computed(() => {
  const conn = currentDynamoConn.value;
  if (!conn) return '';
  const auth = conn.auth;
  if (auth?.kind !== 'sso' && auth?.kind !== 'assumeRole') return '';
  const expTimestamp: number | undefined = (auth as Record<string, unknown>).expirationTimestamp as
    | number
    | undefined;
  if (!expTimestamp) return ''; // no expiry info
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = expTimestamp - nowSec;
  if (remaining <= 0) return 'i-carbon-warning-filled text-destructive'; // expired
  if (remaining < 300) return 'i-carbon-warning-alt text-yellow-500'; // < 5 min
  return 'i-carbon-checkmark-filled text-green-500'; // valid
});

const indexSelectValue = computed(() => {
  const conn = activePanel?.value?.connection;
  if (conn && conn.type === DatabaseType.ELASTICSEARCH) {
    return (conn as ElasticsearchConnection).activeIndex?.index;
  }
  return undefined;
});

const tableSelectValue = computed(() => {
  return activePanel?.value?.activeTable;
});

const connectionOptions = computed(() =>
  connections.value
    .map(({ name }) => ({ label: name, value: name }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

const indexOptions = computed(
  () =>
    activeElasticsearchIndexOption.value
      ?.filter(index => (hideSystemIndicesRef.value ? !index.value.startsWith('.') : true))
      ?.sort((a, b) => a.label.localeCompare(b.label)) ?? [],
);

const tableOptions = computed(() => {
  const conn = (
    ['ES_EDITOR', 'DYNAMO_EDITOR'].includes(props.type ?? '')
      ? activePanel.value.connection
      : connection.value
  ) as DynamoDBConnection | undefined;
  if (!conn || conn.type !== DatabaseType.DYNAMODB) return [];
  const favorites = conn.favoriteTables ?? [];
  const tables = (conn.tables ?? []).map(t => t.name);
  const favoriteTables = tables
    .filter(n => favorites.includes(n))
    .sort((a, b) => a.localeCompare(b));
  const nonFavoriteTables = tables
    .filter(n => !favorites.includes(n))
    .sort((a, b) => a.localeCompare(b));
  return [...favoriteTables, ...nonFavoriteTables].map(n => ({
    label: n,
    value: n,
    favorite: favorites.includes(n),
  }));
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

const handleOpen = async (isOpen: boolean, type: 'CONNECTION' | 'INDEX' | 'TABLE') => {
  if (!isOpen) return;

  if (type === 'CONNECTION') {
    loadingRef.value.connection = true;
    await fetchConnections();
    loadingRef.value.connection = false;
  } else if (type === 'TABLE') {
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
    loadingRef.value.table = true;
    try {
      await fetchTables(selectedConnection as DynamoDBConnection);
    } catch (err) {
      message.error(
        `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
        { closable: true, keepAliveOnHover: true, duration: 3000 },
      );
    }
    loadingRef.value.table = false;
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

const handleUpdate = async (value: string, type: 'CONNECTION' | 'INDEX' | 'TABLE') => {
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
      message.error(`${error.details || 'Operation failed (status: ' + error.status + ')'}`, {
        closable: true,
        keepAliveOnHover: true,
        duration: 36000000,
      });
    }
  } else if (type === 'TABLE') {
    setActiveTable(value);
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

:deep(.connection-select) {
  margin: 0;
  padding: 0 12px;
  height: 35px;
  width: 220px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid hsl(var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

:deep(.connection-select:focus-visible) {
  outline: none;
  box-shadow: none;
}

:deep(.index-select) {
  margin: 0;
  padding: 0 12px;
  height: 35px;
  width: 220px;
  flex-shrink: 0;
  border: none;
  border-right: 1px solid hsl(var(--border));
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

:deep(.index-select:focus-visible) {
  outline: none;
  box-shadow: none;
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

.help-button-container {
  margin-right: 10px;
  display: flex;
  align-items: center;
}

.help-button-container.push-right {
  margin-left: auto;
}

.shortcut-hint {
  opacity: 0.6;
  margin-left: 6px;
}
</style>
