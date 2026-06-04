<template>
  <div class="data-studio-container">
    <!-- History Panel (left sidebar) -->
    <div v-if="historyPanelOpen" class="data-studio-history">
      <SessionHistoryPanel
        @select="switchSession"
        @delete="deleteSession"
        @new-session="startNewSession"
        @close="historyPanelOpen = false"
      />
    </div>

    <!-- Main Conversation Area -->
    <div class="data-studio-main">
      <!-- Header -->
      <div class="data-studio-header">
        <div class="flex items-center gap-2">
          <button
            class="icon-button"
            :class="{ 'icon-button--active': historyPanelOpen }"
            :title="$t('dataStudio.history.title')"
            @click="historyPanelOpen = !historyPanelOpen"
          >
            <span class="i-carbon-time h-5 w-5" />
          </button>
          <span
            class="text-xs font-bold tracking-wider px-3 py-1 border border-border rounded-full"
          >
            {{ $t('dataStudio.title') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="isLoading"
            class="icon-button text-destructive"
            :title="$t('dataStudio.agent.stop')"
            @click="cancelSession"
          >
            <span class="i-carbon-stop-filled h-5 w-5" />
          </button>
          <button
            class="icon-button"
            :title="$t('dataStudio.history.newSession')"
            @click="startNewSession"
          >
            <span class="i-carbon-add h-5 w-5" />
          </button>
          <button
            v-if="hasMessages"
            class="icon-button"
            :title="$t('dataStudio.agent.clearChat')"
            @click="clearChat"
          >
            <span class="i-carbon-trash-can h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Conversation Area using unified ChatPanel -->
      <div class="data-studio-conversation">
        <ChatPanel
          :messages="messages"
          :is-loading="isLoading"
          :error="error"
          :empty-hint="emptyHint"
          :input-placeholder="$t('dataStudio.inputPlaceholder')"
          :session-id="activeSession?.id ?? null"
          :context-settings="lastSettings ?? undefined"
          :progress="activeSession ? dataStudioStore.getSessionProgress(activeSession.id) : null"
          :stop-reason="activeSession?.stopReason ?? null"
          :stop-message="activeSession?.stopMessage ?? null"
          feature="dataStudio"
          compact
          @send="sendMessage"
          @stop-loop="cancelSession"
          @confirm-tool-call="handleConfirmation"
          @model-change="onModelChange"
          @model-picker-open="syncAllProviderModels"
        >
          <template #toolbar-left>
            <div class="toolbox-row-prepend">
              <!-- Connected source chips -->
              <button
                v-for="(source, idx) in activeSessionSources"
                :key="source.sourceId"
                class="source-chip"
                :title="$t('dataStudio.modifySource.title')"
                @click="openModifyModal(idx)"
              >
                <span class="i-carbon-data-base h-3.5 w-3.5 shrink-0" />
                <span class="source-chip-name">{{ source.alias }}</span>
                <span class="source-chip-edit i-carbon-settings h-3 w-3" />
              </button>

              <!-- Add source dropdown -->
              <div ref="addSourcePickerRef" class="add-source-picker">
                <button
                  class="icon-button-sm"
                  :aria-expanded="addSourceOpen"
                  :title="$t('dataStudio.addSource.title')"
                  @click.stop="addSourceOpen = !addSourceOpen"
                >
                  <span class="i-carbon-add-alt h-4 w-4" />
                </button>

                <Transition name="menu-rise">
                  <div v-if="addSourceOpen" class="add-source-menu" @click.stop>
                    <!-- Header -->
                    <div class="add-source-menu-title">
                      {{ $t('dataStudio.addSource.selectConnection') }}
                    </div>

                    <!-- Search -->
                    <div class="add-source-search-wrap">
                      <span class="i-carbon-search add-source-search-icon h-3.5 w-3.5" />
                      <input
                        v-model="addSourceQuery"
                        class="add-source-search"
                        :placeholder="$t('dataStudio.addSource.searchPlaceholder')"
                        :aria-label="$t('dataStudio.addSource.searchPlaceholder')"
                        autocomplete="off"
                        @keydown.esc.stop="resetAddSourceState()"
                      />
                    </div>

                    <!-- Connection list -->
                    <div class="add-source-list">
                      <button
                        v-for="conn in filteredAddConnections"
                        :key="String(conn.id)"
                        class="add-source-item"
                        :class="{
                          'add-source-item--selected': addSourceSelectedId === String(conn.id),
                        }"
                        @click="selectAddConnection(conn)"
                      >
                        <div class="add-source-item-icon">
                          <img
                            :src="getConnectionIcon(conn.type)"
                            class="h-4 w-4 object-contain"
                            :alt="conn.type"
                          />
                        </div>
                        <div class="add-source-item-info">
                          <span class="add-source-item-name">{{ conn.name }}</span>
                          <span class="add-source-item-meta">{{ getConnectionMeta(conn) }}</span>
                        </div>
                        <span
                          v-if="addSourceSelectedId === String(conn.id)"
                          class="i-carbon-checkmark h-3.5 w-3.5 text-foreground ml-auto shrink-0"
                        />
                      </button>
                      <div v-if="filteredAddConnections.length === 0" class="add-source-empty">
                        {{ $t('dataStudio.addSource.noConnections') }}
                      </div>
                    </div>

                    <!-- Permissions panel (shown after a connection is selected) -->
                    <div v-if="addSourceSelectedId" class="add-source-permissions">
                      <div class="add-source-permissions-header">
                        <span class="i-carbon-security h-3.5 w-3.5" />
                        <span class="text-xs font-semibold">
                          {{ $t('dataStudio.modifySource.accessPermissions') }}
                        </span>
                      </div>
                      <div class="add-source-mode-row">
                        <button
                          :class="['mode-btn', addSourceMode === 'Ask' && 'mode-btn--active']"
                          @click="addSourceMode = 'Ask'"
                        >
                          <span class="i-carbon-locked h-3.5 w-3.5" />
                          <span>{{ $t('dataStudio.modifySource.modeDefault') }}</span>
                        </button>
                        <button
                          :class="['mode-btn', addSourceMode === 'Inherit' && 'mode-btn--active']"
                          @click="addSourceMode = 'Inherit'"
                        >
                          <span class="i-carbon-link h-3.5 w-3.5" />
                          <span>{{ $t('dataStudio.modifySource.inheritTitle') }}</span>
                        </button>
                      </div>
                    </div>

                    <!-- Footer -->
                    <div class="add-source-footer">
                      <span class="add-source-count">
                        {{
                          $t('dataStudio.addSource.connectionsFound', {
                            count: filteredAddConnections.length,
                          })
                        }}
                      </span>
                      <button
                        class="add-source-connect-btn"
                        :disabled="!addSourceSelectedId"
                        @click="confirmAddSource"
                      >
                        <span class="i-carbon-data-connected h-3.5 w-3.5" />
                        {{ $t('dataStudio.addSource.connectSource') }}
                      </button>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Permission mode picker -->
              <div class="permission-picker">
                <button
                  class="permission-trigger"
                  :disabled="activeSessionSources.length === 0"
                  :aria-expanded="permissionMenuOpen"
                  :title="$t('dataStudio.modifySource.accessPermissions')"
                  @click.stop="
                    activeSessionSources.length > 0 && (permissionMenuOpen = !permissionMenuOpen)
                  "
                >
                  <span
                    class="h-4 w-4 permission-trigger-icon"
                    :class="
                      sessionPermissionsMode === 'Auto' ? 'i-carbon-unlocked' : 'i-carbon-locked'
                    "
                  />
                  <span class="permission-trigger-label">
                    {{
                      sessionPermissionsMode === 'Auto'
                        ? $t('dataStudio.modifySource.modeFull')
                        : $t('dataStudio.modifySource.modeDefault')
                    }}
                  </span>
                  <span class="i-carbon-chevron-down h-3 w-3 permission-trigger-chevron" />
                </button>
                <div v-if="permissionMenuOpen" class="permission-menu">
                  <div class="permission-menu-title">
                    {{ $t('dataStudio.modifySource.accessPermissions') }}
                  </div>
                  <button
                    class="permission-menu-item"
                    :class="{
                      'permission-menu-item--active': sessionPermissionsMode === 'Ask',
                    }"
                    @click="setAutoMode(false)"
                  >
                    <span class="i-carbon-locked h-4 w-4 permission-menu-icon" />
                    <span class="permission-menu-label">
                      {{ $t('dataStudio.modifySource.modeDefault') }}
                    </span>
                    <span
                      v-if="sessionPermissionsMode === 'Ask'"
                      class="i-carbon-checkmark h-3.5 w-3.5 permission-check"
                    />
                  </button>
                  <button
                    class="permission-menu-item"
                    :class="{
                      'permission-menu-item--active': sessionPermissionsMode === 'Auto',
                    }"
                    @click="setAutoMode(true)"
                  >
                    <span class="i-carbon-unlocked h-4 w-4 permission-menu-icon" />
                    <span class="permission-menu-label">
                      {{ $t('dataStudio.modifySource.modeFull') }}
                    </span>
                    <span
                      v-if="sessionPermissionsMode === 'Auto'"
                      class="i-carbon-checkmark h-3.5 w-3.5 permission-check"
                    />
                  </button>
                </div>
              </div>
            </div>
          </template>
          <template #empty>
            <div class="empty-state-icon">
              <span class="i-carbon-ibm-watsonx-assistant h-12 w-12 opacity-20" />
            </div>
            <p class="text-sm text-muted-foreground mt-4">{{ emptyHint }}</p>
          </template>
        </ChatPanel>
      </div>
    </div>

    <!-- Modals -->
    <ModifySourceModal v-model:open="showModifyModal" :source-idx="selectedSourceIdx" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { onClickOutside } from '@vueuse/core';
import { useAppStore } from '@/store';
import { useConnectionStore, DatabaseType, type Connection } from '@/store/connectionStore';
import { useDataStudioStore } from '@/store/dataStudioStore';
import { useDataStudioChatAgent } from '@/composables';
import { useMessageService } from '@/composables';
import { useLang } from '@/lang';
import ChatPanel from '@/components/chat-panel.vue';
import ModifySourceModal from './components/modify-source-modal.vue';
import SessionHistoryPanel from './components/session-history-panel.vue';
import dynamoDB from '@/assets/svg/dynamoDB.svg?url';
import elasticsearch from '@/assets/svg/elasticsearch.svg?url';
import opensearch from '@/assets/svg/db-opensearch.svg?url';
import easysearch from '@/assets/svg/easysearch.svg?url';
import mongodb from '@/assets/svg/mongodb.svg?url';

const AGENT_SUPPORTED_TYPES = new Set([
  DatabaseType.ELASTICSEARCH,
  DatabaseType.OPENSEARCH,
  DatabaseType.EASYSEARCH,
  DatabaseType.DYNAMODB,
  DatabaseType.MONGODB,
]);

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const connectionStore = useConnectionStore();
const { connections } = storeToRefs(connectionStore);
const dataStudioStore = useDataStudioStore();
const { attachedSources, activeSession } = storeToRefs(dataStudioStore);
const message = useMessageService();
const lang = useLang();

const {
  isLoading,
  error,
  messages,
  sendMessage,
  handleConfirmation: rawHandleConfirmation,
  cancelSession,
  clearChat,
  activeSessionSources,
  lastSettings,
  initContextSettings,
} = useDataStudioChatAgent();

const handleConfirmation = (
  msgId: string,
  event: {
    toolCallId: string;
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'cancel';
  },
) => {
  rawHandleConfirmation(msgId, event.toolCallId, event.action);
};

const showModifyModal = ref(false);
const selectedSourceIdx = ref<number>(-1);
const historyPanelOpen = ref(false);
const permissionMenuOpen = ref(false);
const modelVerified = ref<boolean | null>(null);

const addSourceOpen = ref(false);
const addSourceQuery = ref('');
const addSourceSelectedId = ref('');
const addSourceMode = ref<'Ask' | 'Inherit'>('Inherit');
const addSourcePickerRef = ref<HTMLElement | null>(null);

const resetAddSourceState = () => {
  addSourceOpen.value = false;
  addSourceQuery.value = '';
  addSourceSelectedId.value = '';
  addSourceMode.value = 'Inherit';
};

onClickOutside(addSourcePickerRef, resetAddSourceState);

const availableAddConnections = computed(() => {
  const sessionConnIds = new Set(
    activeSessionSources.value.flatMap(s => {
      const attached = attachedSources.value.find(a => a.sourceId === s.sourceId);
      return attached?.kind === 'database'
        ? [(attached as { connectionId: number }).connectionId]
        : [];
    }),
  );
  return connections.value.filter(
    conn =>
      !sessionConnIds.has(conn.id !== undefined ? Number(conn.id) : -1) &&
      AGENT_SUPPORTED_TYPES.has(conn.type as DatabaseType),
  );
});

const filteredAddConnections = computed(() => {
  const q = addSourceQuery.value.toLowerCase().trim();
  return q
    ? availableAddConnections.value.filter(
        c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
      )
    : availableAddConnections.value;
});

const getConnectionIcon = (type: string) => {
  if (type === DatabaseType.DYNAMODB) return dynamoDB;
  if (type === DatabaseType.OPENSEARCH) return opensearch;
  if (type === DatabaseType.EASYSEARCH) return easysearch;
  if (type === DatabaseType.MONGODB) return mongodb;
  return elasticsearch;
};

const getConnectionMeta = (conn: Connection) => {
  if (conn.type === DatabaseType.ELASTICSEARCH) return `Elasticsearch • ${conn.host}`;
  if (conn.type === DatabaseType.OPENSEARCH) return `OpenSearch • ${conn.host}`;
  if (conn.type === DatabaseType.EASYSEARCH) return `EasySearch • ${conn.host}`;
  if (conn.type === DatabaseType.DYNAMODB) return `DynamoDB • ${conn.region}`;
  if (conn.type === DatabaseType.MONGODB) return `MongoDB • ${conn.host}`;
  return String((conn as Connection).type);
};

const selectAddConnection = (conn: Connection) => {
  addSourceSelectedId.value = String(conn.id);
};

const confirmAddSource = async () => {
  if (!addSourceSelectedId.value) return;
  const conn = connections.value.find(c => String(c.id) === addSourceSelectedId.value);
  if (!conn || conn.id === undefined) return;
  const newSource = dataStudioStore.addDatabaseSourceFromConnection({
    connectionId: Number(conn.id),
    name: conn.name,
    databaseType: conn.type as
      | 'ELASTICSEARCH'
      | 'OPENSEARCH'
      | 'EASYSEARCH'
      | 'DYNAMODB'
      | 'MONGODB',
    permissions: { read: true, create: false, update: false, delete: false },
  });
  if (!dataStudioStore.activeSession) {
    await dataStudioStore.getOrCreateSession([]);
  }
  dataStudioStore.attachSourceToActiveSession(newSource);
  if (addSourceMode.value === 'Ask' && dataStudioStore.activeSession) {
    dataStudioStore.updateSessionSourceMode(
      dataStudioStore.activeSession.id,
      newSource.sourceId,
      'custom',
    );
  }
  resetAddSourceState();
};

const hasMessages = computed(() => messages.value.length > 0);
const emptyHint = computed(() =>
  activeSessionSources.value.length > 0
    ? lang.t('dataStudio.agent.emptyState')
    : lang.t('dataStudio.agent.noSource'),
);

const sessionPermissionsMode = computed(() => activeSession.value?.permissionsMode ?? 'Ask');

const setAutoMode = (auto: boolean) => {
  permissionMenuOpen.value = false;
  const sessionId = activeSession.value?.id;
  if (!sessionId) return;
  dataStudioStore.setSessionPermissionsMode(sessionId, auto ? 'Auto' : 'Ask');
};

const closeOpenMenus = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.permission-picker')) permissionMenuOpen.value = false;
};

const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id).catch(() => {}));
};

const onModelChange = async (modelId: string) => {
  modelVerified.value = null;
  await appStore.setFeatureModelRoute('dataStudio', {
    selectedModelId: modelId,
    useRecommendedModel: false,
  });
  const sess = dataStudioStore.activeSession;
  if (sess?.id) {
    dataStudioStore.setSessionModelId(sess.id, modelId);
  }
  const ok = await appStore.verifyModelAvailability(modelId);
  modelVerified.value = ok;
  if (!ok) message.warning(lang.t('dataStudio.modelUnavailable'));
};

const switchSession = async (sessionId: string) => {
  dataStudioStore.setActiveSession(sessionId);
  const savedModelId = dataStudioStore.sessionMeta[sessionId]?.modelId;
  if (savedModelId) {
    modelVerified.value = null;
    await appStore.setFeatureModelRoute('dataStudio', {
      selectedModelId: savedModelId,
      useRecommendedModel: false,
    });
    const ok = await appStore.verifyModelAvailability(savedModelId);
    modelVerified.value = ok;
  }
  historyPanelOpen.value = false;
};

const deleteSession = async (sessionId: string) => {
  await dataStudioStore.removeSession(sessionId);
};

const startNewSession = () => {
  dataStudioStore.setActiveSession('');
  historyPanelOpen.value = false;
};

const openModifyModal = (index: number) => {
  selectedSourceIdx.value = index;
  showModifyModal.value = true;
};

onMounted(async () => {
  await Promise.all([dataStudioStore.loadSessions(), connectionStore.fetchConnections()]);
  document.addEventListener('click', closeOpenMenus);
  await initContextSettings();
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOpenMenus);
});
</script>

<style scoped>
.data-studio-container {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  background: hsl(var(--background));
}

.data-studio-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.data-studio-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.data-studio-conversation {
  flex: 1;
  padding: 20px 0 20px 20px;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}

.toolbox-row-prepend {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Config Panel */
.data-studio-history {
  width: 280px;
  border-right: 1px solid hsl(var(--border));
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.icon-button--active {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

/* Buttons */
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.2s;
}

.icon-button:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.icon-button-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.2s;
}

.icon-button-sm:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

/* Permission mode picker */
.permission-picker {
  position: relative;
}

.permission-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border-radius: 9999px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--foreground));
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.permission-trigger:hover {
  background: hsl(var(--muted));
}

.permission-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.permission-trigger:disabled:hover {
  background: transparent;
}

.permission-trigger-icon {
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.permission-trigger-label {
  font-size: 12px;
  color: hsl(var(--foreground));
}

.permission-trigger-chevron {
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.permission-picker .permission-trigger[aria-expanded='true'] .permission-trigger-chevron {
  transform: rotate(180deg);
}

.permission-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  padding: 6px;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  animation: menu-rise 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom left;
}

@keyframes menu-rise {
  from {
    opacity: 0;
    transform: scale(0.93) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.permission-menu-title {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 10px 6px;
}

.permission-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.permission-menu-item:hover {
  background: hsl(var(--muted));
}

.permission-menu-icon {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground));
}

.permission-menu-item--active .permission-menu-icon {
  color: hsl(var(--foreground));
}

.permission-menu-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
}

.permission-check {
  color: hsl(var(--foreground));
  flex-shrink: 0;
  animation: check-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes check-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.empty-state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Source chips */
.source-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 7px;
  border-radius: 9999px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.5);
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  max-width: 120px;
  transition: all 0.15s;
}

.source-chip:hover {
  border-color: hsl(var(--foreground) / 0.3);
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.source-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.source-chip-edit {
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s;
}

.source-chip:hover .source-chip-edit {
  opacity: 1;
}

/* Add-source dropdown */
.add-source-picker {
  position: relative;
}

.add-source-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  width: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  transform-origin: bottom left;
}

.add-source-menu-title {
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 12px 6px;
}

.add-source-search-wrap {
  position: relative;
  padding: 0 12px 8px;
}

.add-source-search-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-60%);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}

.add-source-search {
  width: 100%;
  padding: 6px 10px 6px 30px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
  font-size: 13px;
  color: hsl(var(--foreground));
  outline: none;
}

.add-source-search:focus {
  border-color: hsl(var(--foreground) / 0.4);
}

.add-source-search::placeholder {
  color: hsl(var(--muted-foreground));
}

.add-source-list {
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid hsl(var(--border));
}

.add-source-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.add-source-item:last-child {
  border-bottom: none;
}

.add-source-item:hover {
  background: hsl(var(--muted));
}

.add-source-item--selected {
  background: hsl(var(--muted));
}

.add-source-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted));
  flex-shrink: 0;
}

.add-source-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.add-source-item-name {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-source-item-meta {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-source-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.add-source-permissions {
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.3);
}

.add-source-permissions-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 4px;
  color: hsl(var(--muted-foreground));
}

.add-source-mode-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px 12px 8px;
}

.mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
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

.add-source-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.2);
}

.add-source-count {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
}

.add-source-connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.add-source-connect-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-source-connect-btn:not(:disabled):hover {
  opacity: 0.9;
}

/* Menu rise animation */
.menu-rise-enter-active {
  animation: menu-rise 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-rise-leave-active {
  animation: menu-rise 0.14s cubic-bezier(0.16, 1, 0.3, 1) reverse;
}

@keyframes menu-rise {
  from {
    opacity: 0;
    transform: scale(0.93) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
