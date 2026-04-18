<template>
  <div class="data-studio-container">
    <!-- Main Conversation Area -->
    <div class="data-studio-main">
      <!-- Header -->
      <div class="data-studio-header">
        <div class="flex items-center gap-2">
          <span
            class="text-xs font-bold tracking-wider px-3 py-1 border border-border rounded-full"
          >
            {{ $t('dataStudio.title') }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="hasMessages"
            class="icon-button"
            :title="$t('dataStudio.agent.clearChat')"
            @click="clearChat"
          >
            <span class="i-carbon-trash-can h-5 w-5" />
          </button>
          <button v-else class="icon-button" :title="$t('history.empty')">
            <span class="i-carbon-time h-5 w-5" />
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

      <!-- Conversation Area -->
      <div class="data-studio-conversation">
        <div ref="conversationRef" class="conversation-content">
          <!-- Empty state -->
          <div v-if="!hasMessages" class="empty-state">
            <div class="empty-state-icon">
              <span class="i-carbon-ibm-watsonx-assistant h-12 w-12 opacity-20" />
            </div>
            <p class="text-sm text-muted-foreground mt-4">
              {{
                activeConnectionId
                  ? $t('dataStudio.agent.emptyState')
                  : $t('dataStudio.agent.noSource')
              }}
            </p>
          </div>

          <!-- Messages -->
          <template v-if="hasMessages">
            <template v-for="msg in activeSession?.messages" :key="msg.id">
              <AgentMessageBubble :message="msg" />

              <!-- Confirmation cards for pending tool calls on this message -->
              <template
                v-if="
                  msg.role === 'assistant' && msg.toolCalls?.some(tc => tc.status === 'pending')
                "
              >
                <ToolConfirmationCard
                  v-for="tc in msg.toolCalls.filter(tc => tc.status === 'pending')"
                  :key="tc.id"
                  :tool-call="tc"
                  @confirm="handleConfirmation(msg.id, $event)"
                />
              </template>
            </template>

            <!-- Loading indicator -->
            <div v-if="isLoading" class="flex items-center gap-2 py-2">
              <span class="i-carbon-renew h-4 w-4 animate-spin text-muted-foreground" />
              <span class="text-xs text-muted-foreground">
                {{ $t('dataStudio.agent.loading') }}
              </span>
            </div>

            <!-- Error display -->
            <div v-if="error" class="error-banner">
              <span class="i-carbon-warning h-4 w-4" />
              <span class="text-xs">{{ error }}</span>
            </div>
          </template>
        </div>

        <!-- Input Area -->
        <div class="data-studio-input-wrapper">
          <div class="data-studio-input">
            <div class="input-row">
              <textarea
                v-model="inputText"
                class="chat-input"
                rows="3"
                :placeholder="$t('dataStudio.inputPlaceholder')"
                @keydown.enter.exact.prevent="handleSend"
              />
            </div>
            <div class="toolbox-row">
              <div class="toolbox-left">
                <button
                  class="icon-button-sm"
                  :title="$t('dataStudio.addSource.title')"
                  @click="showAddModal = true"
                >
                  <span class="i-carbon-add-alt h-4 w-4" />
                </button>
              </div>
              <div class="toolbox-center">
                <ModelPicker
                  :groups="enabledModelGroups"
                  :model-value="dataStudioRoute.selectedModelId ?? undefined"
                  :recent-model-ids="recentDataStudioModelIds"
                  trigger-class="model-select-trigger compact-select-trigger"
                  panel-class="w-[380px] p-0 bg-[#151515] text-white border-[#2b2b2b]"
                  @open="syncAllProviderModels"
                  @update:model-value="updateDataStudioModel"
                />
              </div>
              <button class="send-button" :disabled="!canSend" @click="handleSend">
                <span class="i-carbon-arrow-up h-4 w-4" />
              </button>
            </div>
          </div>
          <p class="disclaimer-text">
            {{ $t('dataStudio.disclaimer') }}
          </p>
        </div>
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

      <!-- Active Agents Section -->
      <div class="config-section">
        <div class="section-header">
          <span class="section-title">{{ $t('dataStudio.activeAgents') }}</span>
          <span class="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            {{ $t('dataStudio.manage') }}
          </span>
        </div>
        <div class="agent-list">
          <div class="agent-item active-agent">
            <div class="flex items-center gap-2">
              <span class="agent-dot active" />
              <div>
                <p class="text-sm font-medium">SQL Generator</p>
                <p class="text-xs text-muted-foreground">Read-only access</p>
              </div>
            </div>
            <span class="i-carbon-code h-4 w-4 text-muted-foreground" />
          </div>
          <div class="agent-item">
            <div class="flex items-center gap-2">
              <span class="agent-dot" />
              <div>
                <p class="text-sm font-medium">Data Visualization</p>
                <p class="text-xs text-muted-foreground">Charts & Graphs</p>
              </div>
            </div>
            <span class="i-carbon-chart-bar h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </div>

      <!-- MCP Protocol Section -->
      <div class="config-section">
        <div class="section-header">
          <span class="section-title">{{ $t('dataStudio.mcpProtocol') }}</span>
          <span class="text-xs bg-muted px-2 py-0.5 rounded-full font-mono">v1.2.0</span>
        </div>
        <div class="mcp-info">
          <div class="mcp-row">
            <span class="text-sm">{{ $t('dataStudio.contextWindow') }}</span>
            <span class="text-sm font-mono">128k</span>
          </div>
          <div class="mcp-progress">
            <div class="mcp-progress-bar" style="width: 15%" />
          </div>
          <div class="mcp-row">
            <span class="text-sm">{{ $t('dataStudio.temperature') }}</span>
            <span class="text-sm font-mono">0.7</span>
          </div>
        </div>
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
            :class="{ 'active-source': source.connectionId === dataStudioStore.activeConnectionId }"
            @click="dataStudioStore.setActiveConnection(source.connectionId!)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span
                class="h-4 w-4 shrink-0"
                :class="[
                  source.connectionId === dataStudioStore.activeConnectionId
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
import { ref, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/store';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';
import { useDataStudioAgent } from '@/composables/useDataStudioAgent';
import ModelPicker from '@/components/model-picker.vue';
import AddSourceModal from './components/add-source-modal.vue';
import ModifySourceModal from './components/modify-source-modal.vue';
import DetachSourceModal from './components/detach-source-modal.vue';
import AgentMessageBubble from '@/components/agent-message-bubble.vue';
import ToolConfirmationCard from './components/tool-confirmation-card.vue';
import type { ConfirmationAction } from './components/tool-confirmation-card.vue';

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const dataStudioStore = useDataStudioStore();
const { connectedSources, configPanelOpen } = storeToRefs(dataStudioStore);

const { isLoading, error, activeSession, sendMessage, confirmToolCall, clearChat } =
  useDataStudioAgent();

const showAddModal = ref(false);
const showModifyModal = ref(false);
const showDetachModal = ref(false);
const selectedSource = ref<ConnectedSource | null>(null);
const selectedConnectionId = ref<number | undefined>(undefined);
const inputText = ref('');
const conversationRef = ref<HTMLElement | null>(null);

const activeConnectionId = computed(() => dataStudioStore.activeConnectionId);

const hasMessages = computed(() => activeSession.value && activeSession.value.messages.length > 0);
const enabledModelGroups = computed(() =>
  llmSettings.value.providers
    .filter(provider => provider.enabled && provider.discoveredModels.length > 0)
    .map(provider => ({
      id: provider.id,
      label: provider.label,
      models: provider.discoveredModels,
    })),
);
const dataStudioRoute = computed(() => llmSettings.value.models.dataStudio);
const recentDataStudioModelIds = computed(() =>
  dataStudioRoute.value.selectedModelId ? [dataStudioRoute.value.selectedModelId] : [],
);

const canSend = computed(() => !isLoading.value && inputText.value.trim().length > 0);

const updateDataStudioModel = async (value: string) => {
  await appStore.setFeatureModelRoute('dataStudio', {
    selectedModelId: value,
    useRecommendedModel: false,
  });
};

const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id));
};

const handleSend = () => {
  if (!canSend.value) return;
  const text = inputText.value.trim();
  inputText.value = '';
  sendMessage(text, activeConnectionId.value ?? undefined);
};

const handleConfirmation = (msgId: string, event: ConfirmationAction) => {
  confirmToolCall(msgId, event.toolCallId, event.action);
};

const scrollToBottom = () => {
  nextTick(() => {
    if (conversationRef.value) {
      conversationRef.value.scrollTop = conversationRef.value.scrollHeight;
    }
  });
};

watch(
  () => activeSession.value?.messages[activeSession.value.messages.length - 1]?.content,
  () => scrollToBottom(),
);

watch(
  () => activeSession.value?.messages.length,
  () => scrollToBottom(),
);

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
  overflow-y: auto;
  padding: 20px 20px 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.conversation-content {
  flex: 1;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
}

.empty-state-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
  margin: 8px 0;
}

.data-studio-input-wrapper {
  position: sticky;
  bottom: 0;
  width: 100%;
  padding: 16px 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: auto;
  background: linear-gradient(to top, hsl(var(--background)) 75%, transparent);
}

.data-studio-input {
  width: 100%;
  max-width: 800px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.input-row {
  padding: 12px 16px 8px;
}

.chat-input {
  width: 100%;
  min-height: 56px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: hsl(var(--foreground));
  resize: none;
  line-height: 1.5;
  font-family: inherit;
}

.chat-input::placeholder {
  color: hsl(var(--muted-foreground));
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  height: 40px;
  border-top: 1px solid hsl(var(--border));
}

.toolbox-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbox-center {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
}

.model-select-trigger {
  border-radius: 9999px;
  background: hsl(var(--muted) / 0.5);
}

.compact-select-trigger {
  height: 30px;
  min-width: 200px;
  max-width: 280px;
}

.disclaimer-text {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  margin-top: 6px;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.send-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Config Panel */
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

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
  transition: background 0.2s;
}

.agent-item:hover {
  background: hsl(var(--muted));
}

.active-agent {
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
}

.agent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground));
}

.agent-dot.active {
  background: hsl(var(--foreground));
}

/* MCP Section */
.mcp-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mcp-progress {
  height: 4px;
  background: hsl(var(--muted));
  border-radius: 2px;
  overflow: hidden;
}

.mcp-progress-bar {
  height: 100%;
  background: hsl(var(--foreground));
  border-radius: 2px;
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
</style>
