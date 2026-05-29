<template>
  <div class="chatbox-resizable" :style="{ width: `${currentWidth}px` }">
    <div class="resize-handle" @mousedown="startResize" />

    <!-- Session history slide-over -->
    <transition name="history-slide">
      <div v-if="historyPanelOpen" class="chatbox-history-overlay">
        <SessionHistoryPanel
          @select="switchSession"
          @delete="deleteSession"
          @new-session="handleNewSession"
        />
      </div>
    </transition>

    <ChatPanel
      :messages="messages"
      :is-loading="isLoading"
      :error="error"
      :empty-hint="$t('aside.chatBotEmptyHint')"
      :input-placeholder="$t('aside.chatBotPlaceholder')"
      :session-id="activeSession?.id ?? null"
      :context-settings="lastSettings ?? undefined"
      :progress="activeSession ? dataStudioStore.getSessionProgress(activeSession.id) : null"
      :stop-reason="activeSession?.stopReason ?? null"
      :stop-message="activeSession?.stopMessage ?? null"
      feature="sidebarAssistant"
      compact
      @send="sendMessage"
      @stop-loop="cancelSession"
      @confirm-tool-call="handleConfirmation"
      @model-change="onModelChange"
      @model-picker-open="syncAllProviderModels"
    >
      <template #header>
        <div class="header-title">{{ $t('aside.chatBot') }}</div>
        <div class="header-actions">
          <button
            class="header-icon-btn"
            :title="$t('dataStudio.history.newSession')"
            @click="handleNewSession"
          >
            <span class="i-carbon-add h-4 w-4" />
          </button>
          <button
            class="header-icon-btn"
            :class="{ 'header-icon-btn--active': historyPanelOpen }"
            :title="$t('dataStudio.history.title')"
            @click="historyPanelOpen = !historyPanelOpen"
          >
            <span class="i-carbon-time h-4 w-4" />
          </button>
          <button
            class="header-icon-btn"
            :title="$t('dataStudio.agent.clearChat')"
            @click="clearChat"
          >
            <span class="i-carbon-trash-can h-4 w-4" />
          </button>
        </div>
      </template>
    </ChatPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useSidebarChatAgent } from '@/composables';
import ChatPanel from '@/components/chat-panel.vue';
import SessionHistoryPanel from '@/views/data-studio/components/session-history-panel.vue';
import { useAppStore } from '@/store';
import { useDataStudioStore } from '@/store/dataStudioStore';
import { storeToRefs } from 'pinia';

const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 420;

const appStore = useAppStore();
const dataStudioStore = useDataStudioStore();
const { llmSettings } = storeToRefs(appStore);

const {
  isLoading,
  error,
  messages,
  sendMessage,
  handleConfirmation: rawHandleConfirmation,
  clearChat,
  activeSession,
  lastSettings,
  initContextSettings,
  cancelSession,
  startNewSession,
} = useSidebarChatAgent();

const handleConfirmation = (
  msgId: string,
  event: {
    toolCallId: string;
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'cancel';
  },
) => {
  rawHandleConfirmation(msgId, event.toolCallId, event.action);
};

const currentWidth = ref(DEFAULT_WIDTH);
const isResizing = ref(false);
const historyPanelOpen = ref(false);

const startResize = (e: MouseEvent) => {
  isResizing.value = true;
  document.addEventListener('mousemove', onResize);
  document.addEventListener('mouseup', stopResize);
  e.preventDefault();
};

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const newWidth = window.innerWidth - e.clientX - 40;
  currentWidth.value = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
};

const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id).catch(() => {}));
};

const onModelChange = async (_modelId: string) => {
  // Model route persisted by ChatPanel internally
};

const switchSession = (sessionId: string) => {
  dataStudioStore.setActiveSession(sessionId);
  historyPanelOpen.value = false;
};

const deleteSession = async (sessionId: string) => {
  await dataStudioStore.removeSession(sessionId);
};

const handleNewSession = () => {
  startNewSession();
  historyPanelOpen.value = false;
};

onMounted(async () => {
  await dataStudioStore.loadSessions();
  await initContextSettings();
});

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize);
  document.removeEventListener('mouseup', stopResize);
});
</script>

<style scoped>
.chatbox-resizable {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid hsl(var(--border));
  position: relative;
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
  background: transparent;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: hsl(var(--primary) / 0.3);
}

.chatbox-history-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: hsl(var(--background));
  display: flex;
  flex-direction: column;
}

.history-slide-enter-active,
.history-slide-leave-active {
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease;
}

.history-slide-enter-from,
.history-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.15s;
}

.header-icon-btn:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.header-icon-btn--active {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
</style>
