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
              <div>
                <p class="font-semibold text-sm">
                  {{ $t('dataStudio.modifySource.accessPermissions') }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs font-medium text-muted-foreground">
                {{ $t('dataStudio.modifySource.autoMode') }}
              </span>
              <Switch v-model:checked="localAutoMode" />
            </div>
          </div>

          <!-- Auto mode description -->
          <div v-if="localAutoMode" class="auto-mode-desc">
            <span class="i-carbon-information h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{ $t('dataStudio.modifySource.autoModeDesc') }}
            </p>
          </div>

          <!-- Manual checkboxes -->
          <div v-else class="permissions-grid">
            <label v-for="perm in permissionList" :key="perm.key" class="permission-item">
              <Checkbox
                :checked="localPermissions[perm.key as keyof typeof localPermissions]"
                @update:checked="
                  (val: boolean) =>
                    (localPermissions[perm.key as keyof typeof localPermissions] = val)
                "
              />
              <span class="text-sm font-medium">{{ perm.label }}</span>
            </label>
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
import { useI18n } from 'vue-i18n';
import { onClickOutside } from '@vueuse/core';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useConnectionStore, DatabaseType, type Connection } from '@/store/connectionStore';
import {
  useDataStudioStore,
  type ConnectedSource,
  type DataSourcePermissions,
} from '@/store/dataStudioStore';
import dynamoDB from '@/assets/svg/dynamoDB.svg?url';
import elasticsearch from '@/assets/svg/elasticsearch.svg?url';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const connectionStore = useConnectionStore();
const dataStudioStore = useDataStudioStore();
const { connections } = storeToRefs(connectionStore);

const selectedConnectionId = ref<string>('');
const searchQuery = ref('');
const showList = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const localAutoMode = ref(true);
const localPermissions = ref<DataSourcePermissions>({
  read: true,
  create: false,
  update: false,
  delete: false,
});

onClickOutside(dropdownRef, () => {
  if (showList.value) {
    showList.value = false;
  }
});

const permissionList = computed(() => [
  { key: 'read', label: t('dataStudio.modifySource.read') },
  { key: 'create', label: t('dataStudio.modifySource.create') },
  { key: 'update', label: t('dataStudio.modifySource.update') },
  { key: 'delete', label: t('dataStudio.modifySource.delete') },
]);

const availableConnections = computed(() => {
  const connectedIds = new Set(dataStudioStore.connectedSources.map(s => s.connectionId));
  return connections.value.filter(conn => !connectedIds.has(conn.id));
});

const filteredConnections = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return availableConnections.value;
  return availableConnections.value.filter(
    c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
  );
});

const getConnectionIcon = (type: string) => {
  return type === DatabaseType.DYNAMODB ? dynamoDB : elasticsearch;
};

const getConnectionMeta = (conn: Connection) => {
  if (conn.type === DatabaseType.ELASTICSEARCH) {
    return `Elasticsearch • ${conn.host}`;
  }
  if (conn.type === DatabaseType.DYNAMODB) {
    return `DynamoDB • ${conn.region}`;
  }
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
      localAutoMode.value = true;
      localPermissions.value = { read: true, create: false, update: false, delete: false };
    }
  },
);

const handleAdd = () => {
  if (!selectedConnectionId.value) return;
  const conn = connections.value.find(c => String(c.id) === selectedConnectionId.value);
  if (!conn || conn.id === undefined) return;

  const source: ConnectedSource = {
    connectionId: conn.id,
    name: conn.name,
    permissions: { ...localPermissions.value },
    autoMode: localAutoMode.value,
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: hsl(var(--muted) / 0.4);
  border-bottom: 1px solid hsl(var(--border));
}

.auto-mode-desc {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: hsl(var(--background));
}

.permissions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 12px 16px;
  background: hsl(var(--background));
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.permission-item:hover {
  background: hsl(var(--muted));
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
