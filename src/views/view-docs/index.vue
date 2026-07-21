<template>
  <div class="view-docs-container">
    <div class="view-docs-toolbar">
      <SearchableSelect
        :model-value="selectedConnectionName"
        :options="connectionOptions"
        :placeholder="$t('connection.selectConnection')"
        variant="ghost"
        :search-threshold="0"
        class="connection-select"
        @update:model-value="handleConnectionChange"
        @open="handleConnectionOpen"
      />

      <SearchableSelect
        :model-value="selectedIndexName"
        :options="indexOptions"
        :loading="indicesLoading"
        :disabled="!searchConnection"
        :placeholder="$t('connection.selectIndex')"
        variant="ghost"
        :search-threshold="0"
        class="index-select"
        @update:model-value="handleIndexChange"
        @open="handleIndexOpen"
      />

      <div class="toolbar-spacer" />

      <label class="system-indices-toggle">
        <input v-model="includeSystemIndices" type="checkbox" />
        <span>{{ $t('toolBar.includeSystemIndices') }}</span>
      </label>

      <Button
        size="sm"
        variant="outline"
        class="h-7"
        :disabled="!searchConnection || !selectedIndexName"
        @click="schemaDialogOpen = true"
      >
        <span class="i-carbon-data-structured h-3.5 w-3.5 mr-1" />
        {{ $t('manage.index.actions.viewSchema') }}
      </Button>

      <Button
        size="sm"
        variant="outline"
        class="h-7"
        :disabled="!searchConnection || !selectedIndexName"
        @click="copySchema"
      >
        <span class="i-carbon-copy h-3.5 w-3.5 mr-1" />
        {{ $t('manage.index.actions.copySchema') }}
      </Button>
    </div>

    <div v-if="!searchConnection" class="view-docs-empty">
      <Empty :description="$t('manage.docs.selectConnectionHint')" />
    </div>

    <div
      v-else-if="searchConnection && !isSearchConnection(searchConnection)"
      class="view-docs-empty"
    >
      <Empty :description="$t('manage.docs.esOnlyHint')" />
    </div>

    <IndexDocsBrowser
      v-else
      embedded
      enable-search-filters
      :connection="searchConnection"
      :index-name="selectedIndexName"
    />

    <IndexSchemaDialog
      v-model:open="schemaDialogOpen"
      :connection="searchConnection"
      :index-name="selectedIndexName"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { SearchableSelect } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import IndexDocsBrowser from '../manage/components/index-docs-browser.vue';
import IndexSchemaDialog from '../manage/components/index-schema-dialog.vue';
import {
  useConnectionStore,
  useTabStore,
  isSearchConnection,
  type SearchConnection,
} from '@/store';
import { CustomError, jsonify } from '@/common';
import { esApi } from '@/datasources';
import { useLang } from '@/lang';
import { useMessageService } from '@/composables';

const lang = useLang();
const message = useMessageService();
const connectionStore = useConnectionStore();
const tabStore = useTabStore();
const { connections } = storeToRefs(connectionStore);
const { activeConnection } = storeToRefs(tabStore);

const selectedConnectionId = ref<number | undefined>(undefined);
const selectedIndexName = ref('');
const indicesLoading = ref(false);
const includeSystemIndices = ref(false);
const schemaDialogOpen = ref(false);
const indexNames = ref<string[]>([]);

const searchConnections = computed(() =>
  connections.value.filter(conn => isSearchConnection(conn)),
);

const searchConnection = computed((): SearchConnection | undefined => {
  const found = searchConnections.value.find(conn => conn.id === selectedConnectionId.value);
  return found && isSearchConnection(found) ? found : undefined;
});

const selectedConnectionName = computed(() => searchConnection.value?.name ?? '');

const connectionOptions = computed(() =>
  searchConnections.value.map(conn => ({
    label: conn.name,
    value: conn.name,
  })),
);

const indexOptions = computed(() => {
  const names = includeSystemIndices.value
    ? indexNames.value
    : indexNames.value.filter(name => !name.startsWith('.'));
  return names.map(name => ({ label: name, value: name }));
});

const loadConnections = async () => {
  try {
    await connectionStore.fetchConnections();
  } catch (err) {
    message.error(
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err),
    );
  }
};

const loadIndices = async () => {
  if (!searchConnection.value) {
    indexNames.value = [];
    return;
  }

  indicesLoading.value = true;
  try {
    await connectionStore.fetchIndices(searchConnection.value);
    const conn = connections.value.find(c => c.id === searchConnection.value?.id);
    if (conn && isSearchConnection(conn) && Array.isArray(conn.indices)) {
      indexNames.value = conn.indices.map(idx => idx.index);
    } else {
      const indices = await esApi.catIndices(searchConnection.value);
      indexNames.value = indices.map(idx => idx.index);
    }
  } catch (err) {
    indexNames.value = [];
    message.error(
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err),
    );
  } finally {
    indicesLoading.value = false;
  }
};

const handleConnectionOpen = async (isOpen: boolean) => {
  if (isOpen) {
    await loadConnections();
  }
};

const handleIndexOpen = async (isOpen: boolean) => {
  if (isOpen && searchConnection.value) {
    await loadIndices();
  }
};

const handleConnectionChange = (name: string) => {
  const conn = searchConnections.value.find(c => c.name === name);
  selectedConnectionId.value = conn?.id;
  selectedIndexName.value = '';
  indexNames.value = [];
  if (conn) {
    void loadIndices();
  }
};

const handleIndexChange = (indexName: string) => {
  selectedIndexName.value = indexName;
};

const copySchema = async () => {
  if (!searchConnection.value || !selectedIndexName.value) return;
  try {
    const mapping = await esApi.getIndexMapping(searchConnection.value, selectedIndexName.value);
    await navigator.clipboard.writeText(jsonify.stringify(mapping, null, 2));
    message.success(lang.t('manage.schema.copied'));
  } catch (err) {
    message.error(
      err instanceof CustomError ? err.details : err instanceof Error ? err.message : String(err),
    );
  }
};

watch(includeSystemIndices, () => {
  if (selectedIndexName.value.startsWith('.') && !includeSystemIndices.value) {
    selectedIndexName.value = '';
  }
});

onMounted(async () => {
  await loadConnections();

  const preferred =
    (activeConnection.value && isSearchConnection(activeConnection.value)
      ? activeConnection.value
      : undefined) ?? searchConnections.value[0];

  if (preferred) {
    selectedConnectionId.value = preferred.id;
    await loadIndices();
  }
});
</script>

<style scoped>
.view-docs-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  box-sizing: border-box;
  gap: 0.75rem;
}

.view-docs-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.connection-select,
.index-select {
  min-width: 180px;
  max-width: 260px;
}

.toolbar-spacer {
  flex: 1;
}

.system-indices-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  user-select: none;
}

.view-docs-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
