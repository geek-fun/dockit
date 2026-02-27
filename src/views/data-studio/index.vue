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
          <button class="icon-button" :title="$t('history.empty')">
            <span class="i-carbon-time h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- Conversation Area -->
      <div class="data-studio-conversation">
        <div class="conversation-content">
          <!-- Empty state -->
          <div class="empty-state">
            <div class="empty-state-icon">
              <span class="i-carbon-ibm-watsonx-assistant h-12 w-12 opacity-20" />
            </div>
            <p class="text-sm text-muted-foreground mt-4">{{ $t('dataStudio.disclaimer') }}</p>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="data-studio-input">
        <div class="input-container">
          <span class="i-carbon-add-alt h-5 w-5 text-muted-foreground cursor-pointer" />
          <input
            type="text"
            class="chat-input"
            :placeholder="$t('dataStudio.inputPlaceholder')"
            disabled
          />
          <button class="send-button" disabled>
            <span class="i-carbon-arrow-up h-4 w-4" />
          </button>
        </div>
        <p class="text-xs text-muted-foreground text-center mt-2">
          {{ $t('dataStudio.disclaimer') }}
        </p>
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
          <div v-for="(source, index) in connectedSources" :key="index" class="source-item">
            <div class="flex items-center gap-2 min-w-0">
              <span class="i-carbon-data-base h-4 w-4 text-muted-foreground shrink-0" />
              <span class="text-sm truncate">{{ source.name }}</span>
            </div>
            <div class="flex items-center gap-1">
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

    <!-- Toggle config button when panel is closed -->
    <button
      v-if="!configPanelOpen"
      class="config-toggle"
      @click="dataStudioStore.toggleConfigPanel()"
    >
      <span class="i-carbon-settings-adjust h-5 w-5" />
    </button>

    <!-- Modals -->
    <AddSourceModal v-model:open="showAddModal" />
    <ModifySourceModal
      v-model:open="showModifyModal"
      :source="selectedSource"
      :source-index="selectedSourceIndex"
    />
    <DetachSourceModal
      v-model:open="showDetachModal"
      :source="selectedSource"
      :source-index="selectedSourceIndex"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useDataStudioStore, type ConnectedSource } from '@/store/dataStudioStore';
import AddSourceModal from './components/add-source-modal.vue';
import ModifySourceModal from './components/modify-source-modal.vue';
import DetachSourceModal from './components/detach-source-modal.vue';

const dataStudioStore = useDataStudioStore();
const { connectedSources, configPanelOpen } = storeToRefs(dataStudioStore);

const showAddModal = ref(false);
const showModifyModal = ref(false);
const showDetachModal = ref(false);
const selectedSource = ref<ConnectedSource | null>(null);
const selectedSourceIndex = ref(-1);

const openModifyModal = (index: number) => {
  selectedSource.value = connectedSources.value[index];
  selectedSourceIndex.value = index;
  showModifyModal.value = true;
};

const openDetachModal = (index: number) => {
  selectedSource.value = connectedSources.value[index];
  selectedSourceIndex.value = index;
  showDetachModal.value = true;
};
</script>

<style scoped>
.data-studio-container {
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
  padding: 20px;
}

.conversation-content {
  max-width: 800px;
  margin: 0 auto;
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

.data-studio-input {
  padding: 16px 20px 12px;
  border-top: 1px solid hsl(var(--border));
}

.input-container {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 24px;
  background: hsl(var(--background));
  max-width: 800px;
  margin: 0 auto;
}

.chat-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: hsl(var(--foreground));
}

.chat-input::placeholder {
  color: hsl(var(--muted-foreground));
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
  transition: background 0.2s;
}

.source-item:hover {
  background: hsl(var(--muted));
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

.config-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.2s;
}

.config-toggle:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
</style>
