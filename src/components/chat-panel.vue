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

        <Virtualizer
          v-if="viewportEl && messages.length > 0"
          v-slot="{ item: msg }"
          :data="messages"
          :scroll-ref="viewportEl"
          :item-size="160"
        >
          <AgentMessageBubble :message="msg" :iteration-index="iterationIndexMap[msg.id]" />
          <template
            v-if="
              msg.role === 'assistant' &&
              msg.toolCalls?.some((tc: AgentToolCall) => tc.status === 'pending')
            "
          >
            <ToolConfirmationCard
              v-for="tc in msg.toolCalls.filter((tc: AgentToolCall) => tc.status === 'pending')"
              :key="tc.id"
              :tool-call="tc"
              @confirm="handleConfirmation(msg.id, $event)"
            />
          </template>
        </Virtualizer>

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
      <div v-if="progress && isLoading" class="chat-progress-pill" role="status" aria-live="polite">
        <span
          class="chat-progress-pill__dot"
          :class="`chat-progress-pill__dot--${progress.phase}`"
        />
        <span class="chat-progress-pill__label">{{ progressLabel }}</span>
      </div>

      <div v-if="stopReason && stopMessage" class="loop-stopped-banner" role="status">
        <div class="loop-stopped-banner__body">
          <span class="loop-stopped-banner__icon i-carbon-pause-filled" />
          <div class="loop-stopped-banner__texts">
            <span class="loop-stopped-banner__message">{{ stopMessage }}</span>
            <span class="loop-stopped-banner__hint">{{ t('chat.loopStopped.continueHint') }}</span>
          </div>
        </div>
        <div class="loop-stopped-banner__actions">
          <button
            class="loop-stopped-banner__action loop-stopped-banner__action--secondary"
            type="button"
            :disabled="isLoading"
            @click="handleStop"
          >
            {{ t('chat.loopStopped.stopButton') }}
          </button>
          <button
            class="loop-stopped-banner__action loop-stopped-banner__action--primary"
            type="button"
            :disabled="isLoading"
            @click="handleContinue"
          >
            {{ t('chat.loopStopped.continueButton') }}
          </button>
        </div>
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
import { Virtualizer } from 'virtua/vue';
import { useAppStore } from '@/store';
import type { ChatMessage } from '@/types/chat';
import type { AgentToolCall } from '@/store/dataStudioStore';
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
    progress?: { phase: string; iter?: number; maxIter?: number } | null;
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
    progress: null,
    stopReason: null,
    stopMessage: null,
  },
);

const emit = defineEmits<{
  send: [content: string];
  clear: [];
  stopLoop: [];
  confirmToolCall: [
    msgId: string,
    event: { toolCallId: string; action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' },
  ];
  modelChange: [modelId: string];
  modelPickerOpen: [];
}>();

const scrollbarRef = ref<{ viewportElement: HTMLElement | null } | null>(null);
const viewportEl = ref<HTMLElement | null>(null);
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

// Sync scroll without nextTick for streaming (height already changed when RO fires).
let rafId = 0;
const stickToBottomNow = () => {
  if (!stickToBottom.value) return;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const el = getViewport();
    if (!el || !stickToBottom.value) return;
    el.scrollTop = el.scrollHeight;
  });
};

let contentResizeObserver: ResizeObserver | null = null;

const observeContentSize = () => {
  const el = getViewport();
  if (!el) return;
  // Observe the inner content wrapper (first child) so we react to any
  // height growth — streamed text, expanding thinking blocks, tool results,
  // even a lone newline appended to the current assistant message.
  const content = el.firstElementChild as HTMLElement | null;
  if (!content) return;
  contentResizeObserver?.disconnect();
  contentResizeObserver = new ResizeObserver(() => stickToBottomNow());
  contentResizeObserver.observe(content);
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

const handleStop = () => {
  if (props.isLoading) return;
  emit('stopLoop');
};

const progressLabel = computed(() => {
  if (!props.progress) return '';
  if (props.progress.phase === 'iterating') {
    return props.progress.maxIter
      ? t('chat.progress.iterating', { iter: props.progress.iter, maxIter: props.progress.maxIter })
      : t('chat.progress.iteratingNoMax', { iter: props.progress.iter });
  }
  if (props.progress.phase === 'waiting_llm') return t('chat.progress.waitingLlm');
  if (props.progress.phase === 'compacting') return t('chat.progress.compacting');
  return '';
});

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
  () => props.messages.length,
  () => {
    // On new message append: re-stick (user expects to follow new turns) and
    // re-bind the ResizeObserver in case the virtualized content node changed.
    stickToBottom.value = true;
    nextTick(() => {
      observeContentSize();
      stickToBottomNow();
    });
  },
);

watch(
  () => props.contextSettings,
  (next, prev) => {
    if (next && !prev) contextIndicatorRef.value?.refresh();
  },
);

onMounted(async () => {
  await appStore.fetchLlmSettings();
  await nextTick();
  const el = getViewport();
  viewportEl.value = el;
  el?.addEventListener('scroll', handleViewportScroll, { passive: true });
  scrollToBottom('auto');
  await nextTick();
  observeContentSize();
});

onBeforeUnmount(() => {
  const el = getViewport();
  el?.removeEventListener('scroll', handleViewportScroll);
  contentResizeObserver?.disconnect();
  contentResizeObserver = null;
  if (rafId) cancelAnimationFrame(rafId);
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
  /* Buffer at the bottom so the last streamed line never sits flush against
     the chat input area; keeps the latest content visually clear. */
  scroll-padding-bottom: 16px;
}

.chat-messages :deep([data-radix-scroll-area-viewport]) > div {
  /* Virtua may render at an exact fit; this ensures the last bubble has
     breathing room above the input toolbar during streaming. */
  padding-bottom: 16px;
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
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid hsl(38 92% 50% / 0.35);
  background: hsl(38 92% 50% / 0.08);
  color: hsl(var(--foreground));
}

.loop-stopped-banner__body {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 auto;
}

.loop-stopped-banner__texts {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.loop-stopped-banner__icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  color: hsl(38 92% 50%);
}

.loop-stopped-banner__message {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.loop-stopped-banner__hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
}

.loop-stopped-banner__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.loop-stopped-banner__action {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.loop-stopped-banner__action--primary {
  border: 1px solid hsl(38 92% 50% / 0.5);
  background: hsl(38 92% 50% / 0.15);
  color: hsl(var(--foreground));
}

.loop-stopped-banner__action--primary:hover:not(:disabled) {
  background: hsl(38 92% 50% / 0.25);
}

.loop-stopped-banner__action--secondary {
  border: 1px solid transparent;
  background: transparent;
  color: hsl(var(--muted-foreground));
}

.loop-stopped-banner__action--secondary:hover:not(:disabled) {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}

.loop-stopped-banner__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-progress-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: hsl(var(--secondary));
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1;
}

.chat-progress-pill__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: pulse-dot 1s ease-in-out infinite alternate;
}

.chat-progress-pill__dot--iterating {
  background-color: hsl(210 100% 60%);
}

.chat-progress-pill__dot--waiting_llm {
  background-color: hsl(38 92% 50%);
}

.chat-progress-pill__dot--compacting {
  background-color: hsl(270 60% 60%);
}

@keyframes pulse-dot {
  0% {
    opacity: 0.4;
  }
  100% {
    opacity: 1;
  }
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
