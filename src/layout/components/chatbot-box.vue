<template>
  <div class="chat-box-container">
    <div class="chat-box-header">
      <div class="header-title">{{ $t('aside.chatBot') }}</div>
      <div>
        <span
          class="i-carbon-trash-can chat-header-delete-icon cursor-pointer"
          @click="clearMessages"
        />
      </div>
    </div>
    <div class="message-list">
      <ScrollArea ref="scrollbarRef" class="h-full">
        <div v-for="msg in messages" :key="msg.id">
          <AgentMessageBubble :message="msg" />
        </div>
        <div v-if="isLoading" class="flex items-center gap-2 px-4 py-2">
          <span class="i-carbon-renew h-4 w-4 animate-spin text-muted-foreground" />
          <span class="text-xs text-muted-foreground">Thinking…</span>
        </div>
        <div v-if="error" class="error-banner mx-4 my-2">
          <span class="i-carbon-warning h-4 w-4" />
          <span class="text-xs">{{ error }}</span>
        </div>
        <div v-if="messages.length === 0 && !isLoading" class="empty-hint">
          {{ $t('aside.chatBotEmptyHint') }}
        </div>
      </ScrollArea>
    </div>
    <div class="message-footer">
      <div class="model-select-row">
        <ModelPicker
          :groups="enabledModelGroups"
          :model-value="sidebarRoute.selectedModelId ?? undefined"
          :recent-model-ids="recentSidebarModelIds"
          trigger-class="model-select-trigger"
          panel-class="w-[360px] p-0 bg-[#151515] text-white border-[#2b2b2b]"
          @open="syncAllProviderModels"
          @update:model-value="updateSidebarModel"
        />
      </div>
      <div class="chat-input">
        <textarea
          v-model="chatMsg"
          class="chat-textarea"
          placeholder="Type your message here..."
          rows="3"
          @keydown.enter.ctrl="submitMsg"
        />
      </div>
      <div class="footer-operation">
        <Button class="submit-button" :disabled="isLoading || !chatMsg.trim()" @click="submitMsg">
          <Spinner v-if="isLoading" size="sm" />
          <span v-else class="i-carbon-send-alt h-6 w-6" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import { ulid } from 'ulidx';
import { useAppStore } from '../../store';
import { getFeatureModelConfig } from '../../store/chatStore';
import { agentApi } from '../../datasources/agentApi';
import { ProviderEnum } from '../../datasources';
import { useAgentContext } from '../../composables/useAgentContext';
import AgentMessageBubble from '../../components/agent-message-bubble.vue';
import ModelPicker from '@/components/model-picker.vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import type { AgentMessage } from '../../store/dataStudioStore';

type ProviderKind = 'openai' | 'deepseek' | 'openrouter' | 'ollama' | 'custom-openai' | 'custom-anthropic';

const kindToProviderEnum = (kind: ProviderKind): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    default:
      return ProviderEnum.OPENAI;
  }
};

const SYSTEM_PROMPT = [
  'You are a helpful AI assistant embedded in DocKit, a desktop database client.',
  'You help users with database queries, data analysis, and general programming questions.',
  'Be concise and precise. When the user references editor content or a database, use the provided context.',
].join('\n');

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const { buildPromptWithContext } = useAgentContext();

const scrollbarRef = ref<{ $el: HTMLElement } | null>(null);
const chatMsg = ref('');
const isLoading = ref(false);
const error = ref<string | undefined>();
const messages = ref<AgentMessage[]>([]);

const enabledModelGroups = computed(() =>
  llmSettings.value.providers
    .filter(provider => provider.enabled && provider.discoveredModels.length > 0)
    .map(provider => ({
      id: provider.id,
      label: provider.label,
      models: provider.discoveredModels,
    })),
);

const sidebarRoute = computed(() => llmSettings.value.models.sidebarAssistant);
const recentSidebarModelIds = computed(() =>
  sidebarRoute.value.selectedModelId ? [sidebarRoute.value.selectedModelId] : [],
);

const scrollToBottom = () => {
  nextTick(() => {
    scrollbarRef.value?.$el?.scrollTo({ top: 999999, behavior: 'smooth' });
  });
};

const submitMsg = async () => {
  const text = chatMsg.value.trim();
  if (!text || isLoading.value) return;

  chatMsg.value = '';
  error.value = undefined;

  const userMsg: AgentMessage = {
    id: ulid(),
    role: 'user',
    content: buildPromptWithContext(text, ''),
    status: 'done',
    timestamp: Date.now(),
  };

  // Store the display message with just the user's text (not the enriched prompt)
  const displayUserMsg: AgentMessage = { ...userMsg, content: text };
  messages.value = [...messages.value, displayUserMsg];
  scrollToBottom();

  const assistantMsgId = ulid();
  const assistantMsg: AgentMessage = {
    id: assistantMsgId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    timestamp: Date.now(),
  };
  messages.value = [...messages.value, assistantMsg];

  isLoading.value = true;

  const requestId = ulid();
  let unlisten: (() => void) | undefined;

  try {
    const { provider, model } = await getFeatureModelConfig('sidebarAssistant');

    unlisten = await agentApi.onAgentDelta(event => {
      if (event.requestId !== requestId) return;
      messages.value = messages.value.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: m.content + event.content }
          : m,
      );
      scrollToBottom();
    });

    const openAiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      // All previous messages except the streaming assistant placeholder
      ...messages.value
        .filter(m => m.id !== assistantMsgId)
        .map(m => ({
          role: m.role as string,
          content: m.id === userMsg.id ? userMsg.content : m.content,
        })),
    ];

    await agentApi.runAgentStep({
      requestId,
      provider: kindToProviderEnum(provider.kind as ProviderKind),
      model: model.label,
      messages: openAiMessages,
      tools: [],
      httpProxy: provider.proxy || undefined,
      apiKey: provider.apiKey ?? '',
      baseUrl: provider.baseUrl,
    });

    messages.value = messages.value.map(m =>
      m.id === assistantMsgId ? { ...m, status: 'done' as const } : m,
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    messages.value = messages.value.map(m =>
      m.id === assistantMsgId
        ? { ...m, status: 'error' as const, content: m.content || error.value! }
        : m,
    );
  } finally {
    unlisten?.();
    isLoading.value = false;
    scrollToBottom();
  }
};

const clearMessages = () => {
  messages.value = [];
  error.value = undefined;
};

const updateSidebarModel = async (value: string) => {
  await appStore.setFeatureModelRoute('sidebarAssistant', {
    selectedModelId: value,
    useRecommendedModel: false,
  });
};

const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id));
};

appStore.fetchLlmSettings();
</script>

<style scoped>
.chat-box-container {
  height: 100%;
  width: 460px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid hsl(var(--border));
}

.chat-box-header {
  height: 40px;
  line-height: 40px;
  padding: 0 15px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid hsl(var(--border));
}

.header-title {
  font-size: 18px;
  font-weight: bold;
}

.chat-header-delete-icon {
  cursor: pointer;
}

.message-list {
  flex: 1;
  height: 0;
  padding: 10px;
}

.message-footer {
  padding: 0 10px 10px 10px;
  position: relative;
  z-index: 1;
}

.model-select-row {
  margin-bottom: 8px;
}

.model-select-trigger {
  width: 100%;
  justify-content: space-between;
  height: 34px;
  border-radius: 9999px;
  background: hsl(var(--muted) / 0.5);
}

.chat-input {
  height: fit-content;
}

.chat-textarea {
  width: 100%;
  min-height: 72px;
  max-height: 144px;
  padding: 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-size: 14px;
  resize: vertical;
}

.chat-textarea:focus {
  outline: none;
  border-color: hsl(var(--primary));
}

.footer-operation {
  position: absolute;
  bottom: 13px;
  right: 13px;
  z-index: 2;
  height: 30px;
}

.submit-button {
  width: 40px;
  height: 100%;
  padding: 0;
  margin: 0;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}
</style>
