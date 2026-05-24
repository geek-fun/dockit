<template>
  <div class="chat-panel">
    <div v-if="$slots.header" class="chat-header">
      <slot name="header" />
    </div>

    <div class="chat-messages">
      <ScrollArea ref="scrollbarRef" class="h-full">
        <div v-if="messages.length === 0 && !isLoading" class="empty-state">
          <slot name="empty">
            <div class="empty-state-default">
              <span class="i-carbon-ibm-watsonx-assistant h-12 w-12 opacity-20" />
              <p class="text-sm text-muted-foreground mt-4">{{ emptyHint }}</p>
            </div>
          </slot>
        </div>

        <template v-for="msg in messages" :key="msg.id">
          <AgentMessageBubble :message="msg" :iteration-index="iterationIndexMap[msg.id]" />

          <template
            v-if="msg.role === 'assistant' && msg.toolCalls?.some(tc => tc.status === 'pending')"
          >
            <ToolConfirmationCard
              v-for="tc in msg.toolCalls.filter(tc => tc.status === 'pending')"
              :key="tc.id"
              :tool-call="tc"
              @confirm="handleConfirmation(msg.id, $event)"
            />
          </template>
        </template>

        <div v-if="error" class="error-banner">
          <span class="i-carbon-warning h-4 w-4" />
          <span class="text-xs">{{ error }}</span>
          <button class="error-settings-btn" @click="router.push('/setting')">
            {{ $t('setting.ai.configGpt') }}
          </button>
        </div>
      </ScrollArea>
    </div>

    <div class="chat-input-area">
      <div v-if="stopReason && stopMessage" class="loop-stopped-banner" role="status">
        <span class="i-carbon-pause-filled loop-stopped-banner__icon" />
        <span class="loop-stopped-banner__message">{{ stopMessage }}</span>
        <button
          class="loop-stopped-banner__action"
          type="button"
          :disabled="isLoading"
          @click="handleContinue"
        >
          {{ t('chat.loopStopped.continueButton') }}
        </button>
      </div>

      <slot name="input-prepend" />

      <div class="chat-input-wrapper">
        <textarea
          v-model="inputText"
          class="chat-textarea"
          rows="3"
          :placeholder="inputPlaceholder"
          @keydown.enter.exact.prevent="handleSend"
        />

        <div class="chat-toolbar">
          <div class="toolbar-left">
            <slot name="toolbar-left" />
          </div>

          <div class="toolbar-center">
            <ContextIndicator
              v-if="sessionId"
              ref="contextIndicatorRef"
              :session-id="sessionId"
              :settings="contextSettings ?? null"
            />
            <ModelPicker
              v-if="showModelPicker"
              :groups="modelGroups"
              :model-value="selectedModelId"
              :recent-model-ids="recentModelIds"
              :compact="compact"
              @open="onModelPickerOpen"
              @update:model-value="onModelChange"
            />
          </div>

          <button
            class="send-button"
            :class="{ 'send-button--blocked': modelVerified === false }"
            :disabled="!canSend && modelVerified !== false"
            @click="handleSend"
          >
            <Spinner v-if="isLoading" size="sm" />
            <span v-else class="i-carbon-arrow-up h-4 w-4" />
          </button>
        </div>
      </div>

      <slot name="input-append" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/store';
import type { ChatMessage } from '@/types/chat';
import AgentMessageBubble from './agent-message-bubble.vue';
import ToolConfirmationCard from '@/views/data-studio/components/tool-confirmation-card.vue';
import ModelPicker from './model-picker.vue';
import ContextIndicator from './context-indicator.vue';
import { ScrollArea } from './ui/scroll-area';
import { Spinner } from './ui/spinner';
import { useMessageService } from '@/composables';

const { t } = useI18n();
const router = useRouter();
const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const message = useMessageService();

const props = withDefaults(
  defineProps<{
    messages: Array<ChatMessage>;
    isLoading: boolean;
    error?: string;
    emptyHint?: string;
    inputPlaceholder?: string;
    showModelPicker?: boolean;
    feature?: 'sidebarAssistant' | 'dataStudio';
    compact?: boolean;
    sessionId?: string | null;
    contextSettings?: unknown;
    stopReason?: 'iteration_cap' | 'wall_clock_budget' | 'token_budget' | null;
    stopMessage?: string | null;
  }>(),
  {
    error: undefined,
    emptyHint: 'Start a conversation...',
    inputPlaceholder: 'Type your message...',
    showModelPicker: true,
    feature: 'dataStudio',
    compact: false,
    sessionId: null,
    contextSettings: undefined,
    stopReason: null,
    stopMessage: null,
  },
);

const emit = defineEmits<{
  send: [content: string];
  clear: [];
  confirmToolCall: [
    msgId: string,
    event: { toolCallId: string; action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' },
  ];
  modelChange: [modelId: string];
  modelPickerOpen: [];
}>();

const scrollbarRef = ref<{ viewportElement: HTMLElement | null } | null>(null);
const contextIndicatorRef = ref<{ refresh: () => Promise<void> } | null>(null);
const inputText = ref('');
const modelVerified = ref<boolean | null>(null);
const stickToBottom = ref(true);
const STICKY_THRESHOLD_PX = 32;

const getViewport = (): HTMLElement | null => scrollbarRef.value?.viewportElement ?? null;

const isNearBottom = (el: HTMLElement): boolean => {
  const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
  return distance <= STICKY_THRESHOLD_PX;
};

const handleViewportScroll = () => {
  const el = getViewport();
  if (!el) return;
  stickToBottom.value = isNearBottom(el);
};

const canSend = computed(() => inputText.value.trim().length > 0 && !props.isLoading);

const iterationIndexMap = computed<Record<string, number>>(() => {
  let count = 0;
  return props.messages.reduce<Record<string, number>>((acc, msg) => {
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      acc[msg.id] = count++;
    }
    return acc;
  }, {});
});

const modelGroups = computed(() =>
  llmSettings.value.providers
    .filter(provider => provider.enabled && provider.discoveredModels.length > 0)
    .map(provider => ({
      id: provider.id,
      label: provider.label,
      models: provider.discoveredModels,
    })),
);

const featureRoute = computed(() =>
  props.feature === 'sidebarAssistant'
    ? llmSettings.value.models.sidebarAssistant
    : llmSettings.value.models.dataStudio,
);

const selectedModelId = computed(() => featureRoute.value.selectedModelId ?? undefined);
const recentModelIds = computed(() => (selectedModelId.value ? [selectedModelId.value] : []));

const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
  nextTick(() => {
    const el = getViewport();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  });
};

const forceScrollToBottom = () => {
  stickToBottom.value = true;
  scrollToBottom('smooth');
};

const handleSend = async () => {
  if (modelVerified.value === false) {
    message.warning(t('dataStudio.modelUnavailableSend'));
    return;
  }
  if (!canSend.value) return;

  const text = inputText.value.trim();
  inputText.value = '';
  emit('send', text);
  forceScrollToBottom();
};

const handleContinue = () => {
  if (props.isLoading) return;
  emit('send', 'continue');
  forceScrollToBottom();
};

const handleConfirmation = (
  msgId: string,
  event: { toolCallId: string; action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' },
) => {
  emit('confirmToolCall', msgId, event);
};

const onModelChange = async (modelId: string) => {
  modelVerified.value = null;
  emit('modelChange', modelId);

  await appStore.setFeatureModelRoute(props.feature, {
    selectedModelId: modelId,
    useRecommendedModel: false,
  });

  const ok = await appStore.verifyModelAvailability(modelId);
  modelVerified.value = ok;
  if (!ok) message.warning(t('dataStudio.modelUnavailable'));
};

const onModelPickerOpen = () => {
  emit('modelPickerOpen');
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id));
};

watch(
  () => props.messages,
  () => {
    if (stickToBottom.value) scrollToBottom();
  },
  { deep: true },
);

watch(
  () => props.contextSettings,
  (next, prev) => {
    if (next && !prev) contextIndicatorRef.value?.refresh();
  },
);

onMounted(async () => {
  await appStore.fetchLlmSettings();
  const el = getViewport();
  el?.addEventListener('scroll', handleViewportScroll, { passive: true });
  scrollToBottom('auto');
});

onBeforeUnmount(() => {
  const el = getViewport();
  el?.removeEventListener('scroll', handleViewportScroll);
});
</script>

<style scoped>
.chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-header {
  height: 36px;
  line-height: 36px;
  padding: 0 12px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid hsl(var(--border));
}

.chat-messages {
  flex: 1;
  height: 0;
  padding: 8px 0 8px 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.empty-state-default {
  display: flex;
  flex-direction: column;
  align-items: center;
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

.error-settings-btn {
  margin-left: auto;
  font-size: 0.75rem;
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
  color: hsl(var(--destructive));
  padding: 0;
  white-space: nowrap;
}

.error-settings-btn:hover {
  opacity: 0.75;
}

.chat-input-area {
  padding: 8px;
  position: relative;
}

.loop-stopped-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid hsl(38 92% 50% / 0.35);
  background: hsl(38 92% 50% / 0.08);
  color: hsl(var(--foreground));
}

.loop-stopped-banner__icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  color: hsl(38 92% 50%);
}

.loop-stopped-banner__message {
  flex: 1 1 auto;
  font-size: 12px;
  line-height: 1.4;
}

.loop-stopped-banner__action {
  flex: 0 0 auto;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid hsl(38 92% 50% / 0.5);
  background: hsl(38 92% 50% / 0.15);
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: background 0.15s ease;
}

.loop-stopped-banner__action:hover:not(:disabled) {
  background: hsl(38 92% 50% / 0.25);
}

.loop-stopped-banner__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input-wrapper {
  display: flex;
  flex-direction: column;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--background));
}

.chat-textarea {
  width: 100%;
  min-height: 60px;
  padding: 8px 10px;
  border: none;
  outline: none;
  background: transparent;
  color: hsl(var(--foreground));
  font-size: 13px;
  resize: none;
  line-height: 1.5;
}

.chat-textarea:focus {
  outline: none;
}

.chat-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 36px;
  border-top: 1px solid hsl(var(--border));
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.send-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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

.send-button--blocked {
  opacity: 0.5;
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  cursor: not-allowed;
}
</style>
