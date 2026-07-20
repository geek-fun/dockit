<template>
  <div class="connection-list-container">
    <!-- Global Toolbar -->
    <div v-if="totalItems > 0" class="connection-toolbar">
      <div class="toolbar-left">
        <span class="connections-title">{{ $t('connection.savedConnections') }}</span>
        <span class="connections-count">{{ totalItems }}</span>
      </div>
      <div class="toolbar-right">
        <div class="filter-input-wrapper">
          <span class="i-carbon-search filter-icon" />
          <Input
            v-model="filterText"
            :placeholder="$t('connection.filterPlaceholder')"
            class="filter-input"
          />
          <button v-if="filterText" class="filter-clear-btn" @click="filterText = ''">
            <span class="i-carbon-close h-3.5 w-3.5" />
          </button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="sort-trigger">
              <span :class="sortDirIcon" class="h-4 w-4" />
              {{ $t(`connection.sortBy.${activeSortKey}`) }}
              <span class="i-carbon-chevron-down h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="sort-dropdown-content">
            <div class="sort-section-label">{{ $t('connection.sortBy.sortBy') }}</div>
            <DropdownMenuItem
              v-for="option in sortOptions"
              :key="option.key"
              class="sort-menu-item"
              @click="handleSortSelect(option.key)"
            >
              <span class="sort-item-label">{{ option.label }}</span>
              <span
                v-if="activeSortKey === option.key"
                :class="sortDirIcon"
                class="h-3.5 w-3.5 ml-auto text-primary"
              />
            </DropdownMenuItem>
            <div class="sort-divider" />
            <div class="sort-section-label">{{ $t('connection.sortBy.direction') }}</div>
            <DropdownMenuItem class="sort-menu-item" @click="toggleSortDir">
              <span class="sort-item-label">
                {{ $t(`connection.sortBy.${sortDir === 'asc' ? 'ascending' : 'descending'}`) }}
              </span>
              <span :class="sortDirIcon" class="h-3.5 w-3.5 ml-auto text-primary" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <div class="connection-scroll-container">
      <!-- Unified grid: profiles first, then all connections -->
      <div class="connection-list-body">
        <!-- SSH Profile cards -->
        <div
          v-for="profile in sshStore.profiles"
          :key="'ssh-' + profile.id"
          class="connection-card profile-card focus:ring-2 focus:ring-primary focus:outline-none"
          role="button"
          tabindex="0"
          @click="editSshProfile(profile)"
          @keydown.enter="editSshProfile(profile)"
          @keydown.space.prevent="editSshProfile(profile)"
        >
          <div class="card-top">
            <div class="card-icon-wrapper profile-icon">
              <Key class="h-5 w-5" />
            </div>
            <div class="ssh-badge-icon" title="SSH Profile">
              <span class="i-carbon-locked h-3.5 w-3.5 text-green-500" />
            </div>
          </div>
          <div class="card-info">
            <div class="card-name">{{ profile.name }}</div>
            <div class="card-detail">
              {{ profile.username }}@{{ profile.host }}:{{ profile.port }}
            </div>
          </div>
          <div class="card-badges">
            <Badge variant="outline" class="card-badge type-badge profile-type-badge">
              <span class="i-carbon-key h-3 w-3 mr-0.5" />
              SSH
            </Badge>
            <Badge variant="secondary" class="card-badge">
              {{ profile.authMethod || 'password' }}
            </Badge>
          </div>
          <div class="card-actions" @click.stop="">
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="editSshProfile(profile)"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {{ $t('connection.operations.edit') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 text-destructive"
                    @click="deleteSshProfile(profile.id)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {{ $t('connection.operations.remove') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <!-- Connection cards -->
        <div
          v-for="connection in filteredConnections"
          :key="'conn-' + connection.id"
          class="connection-card focus:ring-2 focus:ring-primary focus:outline-none"
          role="button"
          tabindex="0"
          @click="handleSelect('connect', connection)"
          @keydown.enter="handleSelect('connect', connection)"
          @keydown.space.prevent="handleSelect('connect', connection)"
        >
          <div class="card-top">
            <div class="card-icon-wrapper">
              <component :is="getDatabaseIcon(connection.type)" class="h-6 w-6" />
            </div>
            <div v-if="hasSsh(connection)" class="ssh-badge-icon" title="SSH Tunnel">
              <span class="i-carbon-locked h-3.5 w-3.5 text-green-500" />
            </div>
          </div>
          <div class="card-info">
            <div class="card-name">{{ connection.name }}</div>
            <div class="card-detail">{{ getConnectionDetail(connection) }}</div>
          </div>
          <div class="card-badges">
            <Badge variant="outline" class="card-badge type-badge">
              {{ getDatabaseLabel(connection.type) }}
            </Badge>
            <Badge
              v-if="hasSsh(connection)"
              variant="secondary"
              class="card-badge ssh-tunnel-badge"
            >
              <span class="i-carbon-locked h-3 w-3 mr-0.5" />
              SSH
            </Badge>
            <Badge v-if="getVersion(connection)" variant="secondary" class="card-badge">
              {{ getVersion(connection) }}
            </Badge>
            <Badge
              v-if="connection.type === DatabaseType.DYNAMODB"
              variant="secondary"
              class="card-badge"
            >
              {{ getConnectionTarget(connection) }}
            </Badge>
            <Badge
              v-if="connection.type === DatabaseType.MONGODB"
              variant="secondary"
              class="card-badge"
            >
              {{ getMongoAuthLabel(connection) }}
            </Badge>
            <TooltipProvider v-if="getMongoAuthType(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    :class="[
                      getMongoAuthType(connection)!.icon,
                      getMongoAuthType(connection)!.color,
                    ]"
                    class="h-3.5 w-3.5 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  {{ getMongoAuthType(connection)!.label }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider v-if="getMongoTls(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span class="i-carbon-locked text-green-500 h-3.5 w-3.5 cursor-default" />
                </TooltipTrigger>
                <TooltipContent side="top">TLS Enabled</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider v-if="getEsProtocol(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    :class="[getEsProtocol(connection)!.icon, getEsProtocol(connection)!.color]"
                    class="h-3.5 w-3.5 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{{ getEsProtocol(connection)!.label }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider v-if="getEsAuthType(connection)" :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span
                    :class="[getEsAuthType(connection)!.icon, getEsAuthType(connection)!.color]"
                    class="h-3.5 w-3.5 cursor-default"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">{{ getEsAuthType(connection)!.label }}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div class="card-actions" @click.stop="">
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7"
                    @click="handleSelect('connect', connection)"
                  >
                    <span class="i-carbon-login h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {{ $t('connection.operations.connect') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="icon" class="h-7 w-7">
                  <span class="i-carbon-overflow-menu-horizontal h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem @click="handleSelect('edit', connection)">
                  <span class="i-carbon-edit h-4 w-4 mr-2" />
                  {{ $t('connection.operations.edit') }}
                </DropdownMenuItem>
                <DropdownMenuItem @click="handleSelect('clone', connection)">
                  <span class="i-carbon-copy h-4 w-4 mr-2" />
                  {{ $t('connection.operations.clone') }}
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="text-destructive"
                  @click="handleSelect('remove', connection)"
                >
                  <span class="i-carbon-trash-can h-4 w-4 mr-2" />
                  {{ $t('connection.operations.remove') }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div
        v-if="sshStore.profiles.length === 0 && filteredConnections.length === 0"
        class="filter-empty-state"
      >
        <span class="i-carbon-search h-8 w-8 text-muted-foreground" />
        <p class="text-sm text-muted-foreground">{{ $t('connection.noMatchingConnections') }}</p>
      </div>
    </div>
  </div>

  <FloatingMenu @select="handleFabAction" />
  <EsConnectDialog ref="esConnectDialog" />
  <DynamodbConnectDialog ref="dynamodbConnectDialog" />
  <MongodbConnectDialog ref="mongodbConnectDialog" />
  <ConnectingModal ref="connectingModal" />
  <SshProfileDialog ref="sshProfileDialogRef" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { cloneDeep } from 'lodash';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDialogService, useMessageService } from '@/composables';
import { storeToRefs } from 'pinia';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import opensearch from '../../../assets/svg/db-opensearch.svg';
import easysearch from '../../../assets/svg/easysearch.svg';
import mongodb from '../../../assets/svg/mongodb.svg';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import { useLang } from '../../../lang';
import {
  Connection,
  DatabaseType,
  DynamoDBConnection,
  MongoDBConnection,
  SearchConnection,
  isSearchConnection,
  useConnectionStore,
  useSshProfileStore,
  SshProfile,
} from '../../../store';
import FloatingMenu, { type FloatingMenuAction } from './floating-menu.vue';
import EsConnectDialog from './es-connect-dialog.vue';
import DynamodbConnectDialog from './dynamodb-connect-dialog.vue';
import MongodbConnectDialog from './mongodb-connect-dialog.vue';
import ConnectingModal from './connecting-modal.vue';
import SshProfileDialog from './ssh-profile-dialog.vue';
import { Key, Pencil, Trash2 } from 'lucide-vue-next';

type SortKey = 'name' | 'type' | 'dateCreated';

const emits = defineEmits(['tab-panel']);

const dialog = useDialogService();
const message = useMessageService();
const lang = useLang();

const connectionStore = useConnectionStore();
const { fetchConnections, removeConnection, freshConnection } = connectionStore;
const { connections } = storeToRefs(connectionStore);
fetchConnections();

const sshStore = useSshProfileStore();
const sshProfileDialogRef = ref<InstanceType<typeof SshProfileDialog> | null>(null);

const openNewSshProfile = () => {
  sshProfileDialogRef.value?.show(null);
};

const editSshProfile = (profile: SshProfile) => {
  sshProfileDialogRef.value?.show(profile);
};

const deleteSshProfile = async (profileId: string) => {
  const profile = sshStore.profiles.find(p => p.id === profileId);
  if (!profile) return;

  // Check if any connection references this SSH profile
  const referringConnections = connections.value.filter(c =>
    c.ssh?.profileIds?.includes(profileId),
  );
  let warningContent = `Delete SSH profile "${profile.name}" permanently?`;
  if (referringConnections.length > 0) {
    const names = referringConnections.map(c => `"${c.name}"`).join(', ');
    warningContent += `\n\nThis profile is used by ${referringConnections.length} connection(s): ${names}. Those connections will lose SSH tunnel access.`;
  }

  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: warningContent,
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      try {
        await sshStore.deleteProfile(profileId);
        message.success(`SSH profile "${profile.name}" deleted`);
      } catch (_error) {
        message.error('Failed to delete SSH profile');
      }
    },
  });
};

onMounted(async () => {
  await sshStore.fetchProfiles();
});

const filterText = ref('');
const activeSortKey = ref<SortKey>('name');
const sortDir = ref<'asc' | 'desc'>('asc');

const sortDirIcon = computed(() =>
  sortDir.value === 'asc' ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down',
);

const sortFns: Record<SortKey, (a: Connection, b: Connection) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  type: (a, b) =>
    a.type.localeCompare(b.type) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  dateCreated: (a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')),
};

const sortOptions = computed(() => [
  { key: 'name' as SortKey, label: lang.t('connection.sortBy.name') },
  { key: 'type' as SortKey, label: lang.t('connection.sortBy.type') },
  { key: 'dateCreated' as SortKey, label: lang.t('connection.sortBy.dateCreated') },
]);

const handleSortSelect = (key: SortKey) => {
  if (activeSortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    activeSortKey.value = key;
    sortDir.value = 'asc';
  }
};

const toggleSortDir = () => {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
};

const hasSsh = (c: Connection): boolean => 'ssh' in c && c.ssh != null && c.ssh.enabled === true;

const filteredConnections = computed(() => {
  const keyword = filterText.value.toLowerCase().trim();
  const dir = sortDir.value === 'asc' ? 1 : -1;

  const filtered = keyword
    ? connections.value.filter(c => c.name.toLowerCase().includes(keyword))
    : connections.value;

  return [...filtered].sort((a, b) => sortFns[activeSortKey.value](a, b) * dir);
});

const totalItems = computed(() => sshStore.profiles.length + filteredConnections.value.length);

const connectionCancelled = ref(false);
const connectingModal = ref();

const getDatabaseIcon = (type: DatabaseType) => {
  switch (type) {
    case DatabaseType.ELASTICSEARCH:
      return elasticsearch;
    case DatabaseType.OPENSEARCH:
      return opensearch;
    case DatabaseType.EASYSEARCH:
      return easysearch;
    case DatabaseType.DYNAMODB:
      return dynamoDB;
    case DatabaseType.MONGODB:
      return mongodb;
    default:
      return elasticsearch;
  }
};

const getDatabaseLabel = (type: DatabaseType) => {
  switch (type) {
    case DatabaseType.ELASTICSEARCH:
      return 'Elasticsearch';
    case DatabaseType.OPENSEARCH:
      return 'OpenSearch';
    case DatabaseType.EASYSEARCH:
      return 'EasySearch';
    case DatabaseType.DYNAMODB:
      return 'DynamoDB';
    case DatabaseType.MONGODB:
      return 'MongoDB';
    default:
      return 'Unknown';
  }
};

const getConnectionDetail = (connection: Connection) => {
  if (isSearchConnection(connection)) {
    const es = connection as SearchConnection;
    const url = `${es.host}:${es.port}`;
    return url.length > 30 ? url.substring(0, 30) + '...' : url;
  }
  if (connection.type === DatabaseType.MONGODB) {
    const mongo = connection as MongoDBConnection;
    if (mongo.auth.kind === 'uri') {
      const uri = mongo.auth.uri;
      return uri.length > 30 ? uri.substring(0, 30) + '...' : uri;
    }
    const host = `${mongo.host}:${mongo.port}`;
    return host.length > 30 ? host.substring(0, 30) + '...' : host;
  }
  const dynamo = connection as DynamoDBConnection;
  const tableCount = dynamo.tables?.length ?? 0;
  const tableSummary = `${tableCount} table${tableCount === 1 ? '' : 's'}`;
  return dynamo.region ? `${dynamo.region} / ${tableSummary}` : tableSummary;
};

const getVersion = (connection: Connection) => {
  if (isSearchConnection(connection)) {
    const es = connection as SearchConnection;
    return es.version ? `v${es.version}` : '';
  }
  return '';
};

const getConnectionTarget = (connection: Connection) => {
  const dynamo = connection as DynamoDBConnection;
  return dynamo.endpointUrl ? lang.t('connection.localTarget') : lang.t('connection.cloudTarget');
};

const getEsProtocol = (
  connection: Connection,
): { label: string; icon: string; color: string } | null => {
  if (!isSearchConnection(connection)) return null;
  const es = connection as SearchConnection;
  const isHttps = es.host?.toLowerCase().startsWith('https://');
  return isHttps
    ? { label: 'HTTPS', icon: 'i-carbon-locked', color: 'text-green-500' }
    : { label: 'HTTP', icon: 'i-carbon-unlocked', color: 'text-yellow-500' };
};

const getEsAuthType = (
  connection: Connection,
): { label: string; icon: string; color: string } | null => {
  if (!isSearchConnection(connection)) return null;
  const es = connection as SearchConnection;
  if (es.authType === 'basic')
    return {
      label: lang.t('connection.authTypeBasic'),
      icon: 'i-carbon-password',
      color: 'text-blue-500',
    };
  if (es.authType === 'apiKey')
    return {
      label: lang.t('connection.authTypeApiKey'),
      icon: 'i-carbon-api',
      color: 'text-blue-500',
    };
  return {
    label: lang.t('connection.authTypeNone'),
    icon: 'i-carbon-subtract',
    color: 'text-muted-foreground',
  };
};

const getMongoAuthLabel = (connection: Connection): string => {
  if (connection.type !== DatabaseType.MONGODB) return '';
  const mongo = connection as MongoDBConnection;
  if (mongo.auth.kind === 'scram') return lang.t('connection.mongodb.authLabelScram');
  if (mongo.auth.kind === 'uri') return lang.t('connection.mongodb.authLabelUri');
  return lang.t('connection.mongodb.authLabelNone');
};

const getMongoAuthType = (
  connection: Connection,
): { label: string; icon: string; color: string } | null => {
  if (connection.type !== DatabaseType.MONGODB) return null;
  const mongo = connection as MongoDBConnection;
  if (mongo.auth.kind === 'scram')
    return {
      label: lang.t('connection.mongodb.authTypeScram'),
      icon: 'i-carbon-password',
      color: 'text-blue-500',
    };
  if (mongo.auth.kind === 'uri')
    return {
      label: lang.t('connection.mongodb.authTypeUri'),
      icon: 'i-carbon-link',
      color: 'text-purple-500',
    };
  return {
    label: lang.t('connection.mongodb.authTypeNone'),
    icon: 'i-carbon-subtract',
    color: 'text-muted-foreground',
  };
};

const getMongoTls = (connection: Connection): boolean => {
  if (connection.type !== DatabaseType.MONGODB) return false;
  const mongo = connection as MongoDBConnection;
  return mongo.tls === true;
};

const handleSelect = (key: string, connection: Connection) => {
  switch (key) {
    case 'connect':
      establishConnect(connection);
      break;
    case 'edit':
      editConnect(connection);
      break;
    case 'clone':
      cloneConnect(connection);
      break;
    case 'remove':
      removeConnect(connection);
      break;
  }
};

const establishConnect = async (connection: Connection) => {
  connectionCancelled.value = false;

  // Show loading modal with retry callback
  connectingModal.value.show(
    connection.name,
    () => {
      connectionCancelled.value = true;
    },
    () => establishConnect(connection),
  );

  const startTime = Date.now();

  try {
    const newConnection = await freshConnection(connection);

    if (connectionCancelled.value) {
      return;
    }

    if (isSearchConnection(newConnection) && newConnection.version) {
      try {
        const existing = connectionStore.connections.find(c => c.id === newConnection.id);
        if (existing && isSearchConnection(existing)) {
          Object.assign(existing, {
            version: newConnection.version,
            type: newConnection.type,
            clusterName: newConnection.clusterName,
            clusterUuid: newConnection.clusterUuid,
          });
          connectionStore.saveConnection(existing);
        }
      } catch {
        // silently skip — connection already succeeded, version persistence is best-effort
      }
    }

    // Ensure minimum 1.5 seconds loading time
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    if (connectionCancelled.value) {
      return;
    }

    connectingModal.value.hide();
    emits('tab-panel', { action: 'ADD_PANEL', connection: newConnection });
  } catch (err) {
    if (connectionCancelled.value) {
      return;
    }

    // Ensure minimum 1.5 seconds loading time before showing error
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    if (connectionCancelled.value) {
      return;
    }

    // Show error in modal
    let errorMessage = '';
    if (err instanceof CustomError) {
      errorMessage = `status: ${err.status}, details: ${err.details}`;
    } else if (err instanceof Error) {
      errorMessage = err.message;
    } else {
      errorMessage = String(err);
    }

    connectingModal.value.showError(errorMessage);
  }
};

// edit connect info
const editConnect = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing'); // eslint-disable-line no-console
    return;
  }
  if (isSearchConnection(connection)) {
    esConnectDialog.value.showMedal(connection);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(connection);
  } else if (connection.type === DatabaseType.MONGODB) {
    mongodbConnectDialog.value.showMedal(connection);
  }
};

// clone connection
const cloneConnect = (connection: Connection) => {
  if (!connection.type) {
    console.error('Connection type is missing'); // eslint-disable-line no-console
    return;
  }

  const clonedConnection = cloneDeep(connection);
  clonedConnection.id = undefined;
  clonedConnection.name = `${connection.name} (copy)`;

  if (isSearchConnection(connection)) {
    const esClone = clonedConnection as SearchConnection;
    esClone.indices = [];
    esClone.activeIndex = undefined;
    esClone.version = '';
    esClone.clusterName = '';
    esClone.clusterUuid = '';
    esConnectDialog.value.showMedal(esClone);
  } else if (connection.type === DatabaseType.DYNAMODB) {
    const dynamoClone = clonedConnection as DynamoDBConnection;
    dynamoClone.tables = undefined;
    dynamodbConnectDialog.value.showMedal(dynamoClone);
  } else if (connection.type === DatabaseType.MONGODB) {
    const mongoClone = clonedConnection as MongoDBConnection;
    mongoClone.collections = undefined;
    mongodbConnectDialog.value.showMedal(mongoClone);
  }
};

const removeConnect = (connection: Connection) => {
  dialog.warning({
    title: lang.t('dialogOps.warning'),
    content: lang.t('dialogOps.removeNotice'),
    positiveText: lang.t('dialogOps.confirm'),
    negativeText: lang.t('dialogOps.cancel'),
    onPositiveClick: async () => {
      try {
        await removeConnection(connection);
        message.success(lang.t('dialogOps.removeSuccess'));
      } catch (_error) {
        message.error(lang.t('connection.unknownError'));
      }
    },
  });
};

const esConnectDialog = ref();
const dynamodbConnectDialog = ref();
const mongodbConnectDialog = ref();

const handleFabAction = (action: FloatingMenuAction) => {
  if (action === 'sshProfile') {
    openNewSshProfile();
    return;
  }
  if (
    action === DatabaseType.ELASTICSEARCH ||
    action === DatabaseType.OPENSEARCH ||
    action === DatabaseType.EASYSEARCH
  ) {
    esConnectDialog.value.showMedal(null, action);
  } else if (action === DatabaseType.DYNAMODB) {
    dynamodbConnectDialog.value.showMedal(null);
  } else if (action === DatabaseType.MONGODB) {
    mongodbConnectDialog.value.showMedal(null);
  }
};
</script>

<style scoped>
.connection-list-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.connection-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.connections-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

.connections-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.filter-input-wrapper {
  position: relative;
  flex: 1;
  max-width: 320px;
}

.filter-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}

.filter-input {
  padding-left: 28px;
  padding-right: 28px;
}

.filter-clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.filter-clear-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--muted));
}

.sort-trigger {
  gap: 6px;
  white-space: nowrap;
}

.sort-dropdown-content {
  min-width: 180px;
}

.sort-section-label {
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

.sort-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sort-item-label {
  flex: 1;
}

.sort-divider {
  height: 1px;
  background: hsl(var(--border));
  margin: 4px 8px;
}

.filter-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
}

.connection-scroll-container {
  flex: 1;
  height: 0;
  overflow: auto;
}

.connection-list-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, 240px);
  gap: 16px;
  padding: 16px;
}

.ssh-badge-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: hsl(var(--primary) / 0.08);
}

.ssh-tunnel-badge {
  color: hsl(142 76% 36%);
  border-color: hsl(142 76% 36% / 0.3);
  background: hsl(142 76% 36% / 0.06);
}

.profile-card {
  background: hsl(var(--primary) / 0.02);
}

.profile-icon {
  background: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
}

.profile-type-badge {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.06);
}

.connection-card {
  width: 240px;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.connection-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border-color: hsl(var(--primary) / 0.3);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: hsl(var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-info {
  min-height: 0;
  margin-bottom: 14px;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: hsl(var(--foreground));
  margin-bottom: 4px;
}

.card-detail {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: auto;
  align-content: flex-start;
}

.card-badge {
  font-size: 11px;
  padding: 1px 8px;
  font-weight: 500;
}

.type-badge {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.3);
  background: hsl(var(--primary) / 0.06);
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}
</style>
