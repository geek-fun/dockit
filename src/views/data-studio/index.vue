<template>
  <div class="data-studio-container">
    <!-- History Panel (left sidebar) -->
    <div v-if="historyPanelOpen" class="data-studio-history">
      <SessionHistoryPanel
        @select="switchSession"
        @delete="deleteSession"
        @new-session="startNewSession"
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
            v-if="hasMessages"
            class="icon-button"
            :title="$t('dataStudio.agent.clearChat')"
            @click="clearChat"
          >
            <span class="i-carbon-trash-can h-5 w-5" />
          </button>
          <button
            v-if="!configPanelOpen"
            class="icon-button"
            @click="dataStudioStore.toggleConfigPanel()"
          >
            <span class="i-carbon-settings-adjust h-5 w-5" />
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
          feature="dataStudio"
          compact
          @send="sendMessage"
          @confirm-tool-call="handleConfirmation"
          @model-change="onModelChange"
          @model-picker-open="syncAllProviderModels"
        >
          <template #toolbar-left>
            <div class="toolbox-row-prepend">
              <button
                class="icon-button-sm"
                :title="$t('dataStudio.addSource.title')"
                @click="showAddModal = true"
              >
                <span class="i-carbon-add-alt h-4 w-4" />
              </button>
              <!-- Permission mode picker -->
              <div v-if="activeSource" class="permission-picker">
                <button
                  class="permission-trigger"
                  :aria-expanded="permissionMenuOpen"
                  :title="$t('dataStudio.modifySource.accessPermissions')"
                  @click.stop="permissionMenuOpen = !permissionMenuOpen"
                >
                  <span
                    class="h-4 w-4 permission-trigger-icon"
                    :class="
                      activeSource.permissionsMode === 'Auto'
                        ? 'i-carbon-unlocked'
                        : 'i-carbon-locked'
                    "
                  />
                  <span class="permission-trigger-label">
                    {{
                      activeSource.permissionsMode === 'Auto'
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
                      'permission-menu-item--active': activeSource.permissionsMode === 'Ask',
                    }"
                    :data-tooltip="$t('dataStudio.modifySource.modeDefaultDesc')"
                    @click="setAutoMode(false)"
                  >
                    <span class="i-carbon-locked h-4 w-4 permission-menu-icon" />
                    <span class="permission-menu-label">
                      {{ $t('dataStudio.modifySource.modeDefault') }}
                    </span>
                    <span
                      v-if="activeSource.permissionsMode === 'Ask'"
                      class="i-carbon-checkmark h-3.5 w-3.5 permission-check"
                    />
                  </button>
                  <button
                    class="permission-menu-item"
                    :class="{
                      'permission-menu-item--active': activeSource.permissionsMode === 'Auto',
                    }"
                    :data-tooltip="$t('dataStudio.modifySource.modeFullDesc')"
                    @click="setAutoMode(true)"
                  >
                    <span class="i-carbon-unlocked h-4 w-4 permission-menu-icon" />
                    <span class="permission-menu-label">
                      {{ $t('dataStudio.modifySource.modeFull') }}
                    </span>
                    <span
                      v-if="activeSource.permissionsMode === 'Auto'"
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

    <!-- Configuration Panel -->
    <div v-if="configPanelOpen" class="data-studio-config">
      <div class="config-header">
        <h3 class="text-base font-semibold">{{ $t('dataStudio.configuration') }}</h3>
        <button class="icon-button" @click="dataStudioStore.toggleConfigPanel()">
          <span class="i-carbon-settings-adjust h-5 w-5" />
        </button>
      </div>

      <!-- Connected Sources Section -->
      <div class="config-section">
        <div class="section-header">
          <span class="section-title">{{ $t('dataStudio.connectedSources') }}</span>
          <button class="icon-button-sm" @click="showAddModal = true">
            <span class="i-carbon-add h-4 w-4" />
          </button>
        </div>
        <div class="source-list">
          <div
            v-for="(source, index) in connectedSources"
            :key="index"
            class="source-item"
            :class="{ 'active-source': source.connectionId === activeConnectionId }"
            @click="setActiveConnection(source.connectionId!)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="h-4 w-4 shrink-0"
                :class="[
                  source.connectionId === activeConnectionId
                    ? 'i-carbon-data-base-alt text-foreground'
                    : 'i-carbon-data-base text-muted-foreground',
                ]"
              />
              <span class="text-sm truncate">{{ source.name }}</span>
            </div>
            <div class="flex items-center gap-1" @click.stop>
              <button
                class="icon-button-sm"
                :title="$t('dataStudio.modifySource.title')"
                @click="openModifyModal(index)"
              >
                <span class="i-carbon-settings h-3.5 w-3.5" />
              </button>
              <button
                class="icon-button-sm detach-button"
                :title="$t('dataStudio.detachSource.title')"
                @click="openDetachModal(index)"
              >
                <span class="i-carbon-unlink h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div v-if="connectedSources.length === 0" class="text-xs text-muted-foreground py-2">
            {{ $t('dataStudio.addSource.noConnections') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AddSourceModal v-model:open="showAddModal" />
    <ModifySourceModal
      v-model:open="showModifyModal"
      :source="selectedSource"
      :connection-id="selectedConnectionId"
    />
    <DetachSourceModal
      v-model:open="showDetachModal"
      :source="selectedSource"
      :connection-id="selectedConnectionId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/store';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';
import { useDataStudioChatAgent } from '@/composables';
import { useMessageService } from '@/composables';
import { useLang } from '@/lang';
import ChatPanel from '@/components/chat-panel.vue';
import AddSourceModal from './components/add-source-modal.vue';
import ModifySourceModal from './components/modify-source-modal.vue';
import DetachSourceModal from './components/detach-source-modal.vue';
import SessionHistoryPanel from './components/session-history-panel.vue';

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const dataStudioStore = useDataStudioStore();
const { connectedSources, configPanelOpen } = storeToRefs(dataStudioStore);
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
  activeConnectionId,
  activeSource,
} = useDataStudioChatAgent();

const handleConfirmation = (
  msgId: string,
  event: { toolCallId: string; action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' },
) => {
  rawHandleConfirmation(msgId, event.toolCallId, event.action);
};

const showAddModal = ref(false);
const showModifyModal = ref(false);
const showDetachModal = ref(false);
const selectedSource = ref<ConnectedSource | null>(null);
const selectedConnectionId = ref<number | undefined>(undefined);
const historyPanelOpen = ref(false);
const permissionMenuOpen = ref(false);
const modelVerified = ref<boolean | null>(null);

const hasMessages = computed(() => messages.value.length > 0);
const emptyHint = computed(() =>
  activeConnectionId.value
    ? lang.t('dataStudio.agent.emptyState')
    : lang.t('dataStudio.agent.noSource'),
);

const setAutoMode = (auto: boolean) => {
  permissionMenuOpen.value = false;
  if (!activeSource.value) return;
  const idx = connectedSources.value.findIndex(
    s => s.connectionId === activeSource.value!.connectionId,
  );
  if (idx === -1) return;
  const mode = auto ? 'Auto' : 'Ask';
  const permissions = auto
    ? { read: true, create: true, update: true, delete: true }
    : { read: true, create: false, update: false, delete: false };
  dataStudioStore.updateSource(idx, { permissionsMode: mode, permissions });
};

const closePermissionMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.permission-picker')) {
    permissionMenuOpen.value = false;
  }
};

const setActiveConnection = (connectionId: number) => {
  dataStudioStore.setActiveConnection(connectionId);
};

const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id));
};

const onModelChange = async (modelId: string) => {
  modelVerified.value = null;
  await appStore.setFeatureModelRoute('dataStudio', {
    selectedModelId: modelId,
    useRecommendedModel: false,
  });
  const activeSession = dataStudioStore.activeSession;
  if (activeSession?.id) {
    dataStudioStore.setSessionModelId(activeSession.id, modelId);
  }
  const ok = await appStore.verifyModelAvailability(modelId);
  modelVerified.value = ok;
  if (!ok) message.warning(lang.t('dataStudio.modelUnavailable'));
};

const switchSession = async (sessionId: string) => {
  dataStudioStore.setActiveSession(sessionId);
  const session = dataStudioStore.sessions.find(s => s.id === sessionId);
  if (session && session.connectionId !== -1) {
    dataStudioStore.setActiveConnection(session.connectionId);
  }
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
  const source = connectedSources.value[index];
  selectedSource.value = source;
  selectedConnectionId.value = source?.connectionId;
  showModifyModal.value = true;
};

const openDetachModal = (index: number) => {
  const source = connectedSources.value[index];
  selectedSource.value = source;
  selectedConnectionId.value = source?.connectionId;
  showDetachModal.value = true;
};

onMounted(async () => {
  await dataStudioStore.loadSessions();
  document.addEventListener('click', closePermissionMenu);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closePermissionMenu);
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
  padding: 20px;
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

.data-studio-config {
  width: 280px;
  border-left: 1px solid hsl(var(--border));
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.config-section {
  padding: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground));
}

/* Source List */
.source-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.source-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.source-item:hover {
  background: hsl(var(--muted));
}

.source-item.active-source {
  background: hsl(var(--muted));
  border-color: hsl(var(--border));
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

.detach-button:hover {
  color: hsl(var(--destructive));
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
</style>
