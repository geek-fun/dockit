<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[540px] p-0 gap-0 overflow-hidden">
      <!-- Header -->
      <DialogHeader class="px-6 pt-6 pb-4">
        <DialogTitle class="text-lg font-semibold">
          {{ $t('dataStudio.addSource.title') }}
        </DialogTitle>
      </DialogHeader>

      <div class="px-6 pb-6 flex flex-col gap-4">
        <!-- SELECT CONNECTION label -->
        <div>
          <p class="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2">
            {{ $t('dataStudio.addSource.selectConnection') }}
          </p>

          <!-- Dropdown wrapper -->
          <div ref="dropdownRef">
            <!-- Search box -->
            <div class="relative">
              <span
                class="i-carbon-search absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              />
              <input
                v-model="searchQuery"
                type="text"
                class="connection-search"
                :placeholder="$t('dataStudio.addSource.searchPlaceholder')"
                @click="showList = true"
              />
              <span
                class="i-carbon-chevron-up absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground cursor-pointer transition-transform"
                :class="{ 'rotate-180': !showList }"
                @click="showList = !showList"
              />
            </div>

            <!-- Connection list -->
            <Transition name="dropdown">
              <div v-if="showList" class="connection-list">
                <div class="connection-items">
                  <template v-if="filteredConnections.length > 0">
                    <button
                      v-for="conn in filteredConnections"
                      :key="String(conn.id)"
                      class="connection-item"
                      :class="{
                        'connection-item--selected': String(conn.id) === selectedConnectionId,
                      }"
                      @click="selectConnection(conn)"
                    >
                      <div class="connection-item-icon">
                        <img :src="getConnectionIcon(conn.type)" class="h-5 w-5 object-contain" />
                      </div>
                      <div class="connection-item-info">
                        <span class="connection-item-name">{{ conn.name }}</span>
                        <span class="connection-item-meta">{{ getConnectionMeta(conn) }}</span>
                      </div>
                      <span
                        v-if="String(conn.id) === selectedConnectionId"
                        class="i-carbon-chevron-right h-4 w-4 text-muted-foreground ml-auto"
                      />
                    </button>
                  </template>
                  <div v-else class="px-4 py-3 text-sm text-muted-foreground">
                    {{ $t('dataStudio.addSource.noConnections') }}
                  </div>
                </div>

                <!-- Footer row -->
                <div class="connection-list-footer">
                  <span
                    class="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {{
                      $t('dataStudio.addSource.connectionsFound', {
                        count: filteredConnections.length,
                      })
                    }}
                  </span>
                </div>
              </div>
            </Transition>
          </div>
        </div>

        <!-- Hint when no connection selected and list is collapsed -->
        <p v-if="!showList && !selectedConnectionId" class="text-sm text-muted-foreground -mt-2">
          {{ $t('dataStudio.addSource.selectHint') }}
        </p>

        <!-- Access Permissions panel (shown after connection selected) -->
        <div v-if="selectedConnectionId" class="permissions-panel">
          <div class="permissions-header">
            <div class="flex items-center gap-2">
              <span class="i-carbon-security h-4 w-4" />
              <p class="font-semibold text-sm">
                {{ $t('dataStudio.modifySource.accessPermissions') }}
              </p>
            </div>
          </div>
          <div class="permissions-mode-row">
            <button
              :class="['mode-btn', localPermissionsMode === 'Ask' && 'mode-btn--active']"
              @click="localPermissionsMode = 'Ask'"
            >
              <span class="i-carbon-view h-4 w-4" />
              <span>{{ $t('dataStudio.modifySource.modeDefault') }}</span>
            </button>
            <button
              :class="['mode-btn', localPermissionsMode === 'Auto' && 'mode-btn--active']"
              @click="localPermissionsMode = 'Auto'"
            >
              <span class="i-carbon-unlocked h-4 w-4" />
              <span>{{ $t('dataStudio.modifySource.modeFull') }}</span>
            </button>
          </div>
          <div class="mode-desc">
            <span class="i-carbon-information h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{
                localPermissionsMode === 'Ask'
                  ? $t('dataStudio.modifySource.modeDefaultDesc')
                  : $t('dataStudio.modifySource.modeFullDesc')
              }}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <DialogFooter class="px-6 pb-6 flex items-center justify-between">
        <Button variant="ghost" class="text-muted-foreground" @click="$emit('update:open', false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button :disabled="!selectedConnectionId" class="gap-2" @click="handleAdd">
          <span class="i-carbon-data-connected h-4 w-4" />
          {{ $t('dataStudio.addSource.connectSource') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { onClickOutside } from '@vueuse/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useConnectionStore, DatabaseType, type Connection } from '@/store/connectionStore';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';
import dynamoDB from '@/assets/svg/dynamoDB.svg?url';
import elasticsearch from '@/assets/svg/elasticsearch.svg?url';
import opensearch from '@/assets/svg/db-opensearch.svg?url';
import easysearch from '@/assets/svg/easysearch.svg?url';

const AGENT_SUPPORTED_TYPES = new Set([
  DatabaseType.ELASTICSEARCH,
  DatabaseType.OPENSEARCH,
  DatabaseType.EASYSEARCH,
  DatabaseType.DYNAMODB,
]);

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const connectionStore = useConnectionStore();
const dataStudioStore = useDataStudioStore();
const { connections } = storeToRefs(connectionStore);

const selectedConnectionId = ref<string>('');
const searchQuery = ref('');
const showList = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const localPermissionsMode = ref<'Ask' | 'Auto'>('Ask');

onClickOutside(dropdownRef, () => {
  if (showList.value) {
    showList.value = false;
  }
});

const availableConnections = computed(() => {
  const connectedIds = new Set(dataStudioStore.connectedSources.map(s => s.connectionId));
  return connections.value.filter(
    conn =>
      !connectedIds.has(typeof conn.id === 'number' ? conn.id : undefined) &&
      AGENT_SUPPORTED_TYPES.has(conn.type as DatabaseType),
  );
});

const filteredConnections = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return availableConnections.value;
  return availableConnections.value.filter(
    c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
  );
});

const getConnectionIcon = (type: string) => {
  if (type === DatabaseType.DYNAMODB) return dynamoDB;
  if (type === DatabaseType.OPENSEARCH) return opensearch;
  if (type === DatabaseType.EASYSEARCH) return easysearch;
  return elasticsearch;
};

const getConnectionMeta = (conn: Connection) => {
  if (conn.type === DatabaseType.ELASTICSEARCH) return `Elasticsearch • ${conn.host}`;
  if (conn.type === DatabaseType.OPENSEARCH) return `OpenSearch • ${conn.host}`;
  if (conn.type === DatabaseType.EASYSEARCH) return `EasySearch • ${conn.host}`;
  if (conn.type === DatabaseType.DYNAMODB) return `DynamoDB • ${conn.region}`;
  return (conn as Connection).type;
};

const selectConnection = (conn: Connection) => {
  selectedConnectionId.value = String(conn.id);
  showList.value = false;
  searchQuery.value = conn.name;
};

watch(
  () => props.open,
  newVal => {
    if (newVal) {
      selectedConnectionId.value = '';
      searchQuery.value = '';
      showList.value = false;
      localPermissionsMode.value = 'Ask';
    }
  },
);

const permissionsFromMode = (mode: 'Ask' | 'Auto') =>
  mode === 'Auto'
    ? { read: true, create: true, update: true, delete: true }
    : { read: true, create: false, update: false, delete: false };

const handleAdd = () => {
  if (!selectedConnectionId.value) return;
  const conn = connections.value.find(c => String(c.id) === selectedConnectionId.value);
  if (!conn || conn.id === undefined) return;

  const source: ConnectedSource = {
    connectionId: typeof conn.id === 'number' ? conn.id : undefined,
    name: conn.name,
    permissions: permissionsFromMode(localPermissionsMode.value),
    permissionsMode: localPermissionsMode.value,
  };

  dataStudioStore.addSource(source);
  emit('update:open', false);
};
</script>

<style scoped>
.connection-search {
  width: 100%;
  padding: 10px 40px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--background));
  font-size: 14px;
  color: hsl(var(--foreground));
  outline: none;
  transition: border-color 0.2s;
}

.connection-search:focus {
  border-color: hsl(var(--foreground));
}

.connection-search::placeholder {
  color: hsl(var(--muted-foreground));
}

.connection-list {
  margin-top: 2px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
  background: hsl(var(--background));
  display: flex;
  flex-direction: column;
}

.connection-items {
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid hsl(var(--border));
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.connection-item:last-of-type {
  border-bottom: none;
}

.connection-item:hover {
  background: hsl(var(--muted));
}

.connection-item--selected {
  background: hsl(var(--muted));
}

.connection-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted));
  flex-shrink: 0;
}

.connection-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.connection-item-name {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-item-meta {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-list-footer {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: hsl(var(--muted) / 0.5);
  border-top: 1px solid hsl(var(--border));
}

/* Permissions panel */
.permissions-panel {
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  overflow: hidden;
}

.permissions-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: hsl(var(--muted) / 0.4);
  border-bottom: 1px solid hsl(var(--border));
}

.permissions-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 16px;
  background: hsl(var(--background));
  border-bottom: 1px solid hsl(var(--border));
}

.mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.mode-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.mode-btn--active {
  background: hsl(var(--primary) / 0.08);
  border-color: hsl(var(--primary) / 0.4);
  color: hsl(var(--primary));
}

.mode-desc {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: hsl(var(--background));
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
