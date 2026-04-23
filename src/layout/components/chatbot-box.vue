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
          <AgentMessageBubble :message="msg" :iteration-index="iterationIndexMap[msg.id]" />
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
        <Button
          class="submit-button"
          :class="{ 'submit-button--blocked': modelVerified === false }"
          :disabled="(isLoading || !chatMsg.trim()) && modelVerified !== false"
          @click="submitMsg"
        >
          <Spinner v-if="isLoading" size="sm" />
          <span v-else class="i-carbon-send-alt h-6 w-6" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore, useChatStore } from '../../store';
import { ChatMessageRole } from '../../datasources';
import { useMessageService } from '@/composables';
import { useLang } from '@/lang';
import AgentMessageBubble from '../../components/agent-message-bubble.vue';
import ModelPicker from '@/components/model-picker.vue';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';

const appStore = useAppStore();
const { llmSettings } = storeToRefs(appStore);
const chatStore = useChatStore();
const { activeChat } = storeToRefs(chatStore);
const { fetchChats, sendMessage, deleteChat } = chatStore;
const message = useMessageService();
const lang = useLang();

const scrollbarRef = ref<{ $el: HTMLElement } | null>(null);
const chatMsg = ref('');
const isLoading = ref(false);
const error = ref<string | undefined>();
const modelVerified = ref<boolean | null>(null);
const messages = computed(() => activeChat.value?.messages ?? []);

const iterationIndexMap = computed<Record<string, number>>(() => {
  let count = 0;
  return messages.value.reduce<Record<string, number>>((acc, msg) => {
    if (msg.role === ChatMessageRole.BOT && msg.content) {
      acc[msg.id] = count++;
    }
    return acc;
  }, {});
});

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
  if (modelVerified.value === false) {
    message.warning(lang.t('dataStudio.modelUnavailableSend'));
    return;
  }
  const text = chatMsg.value.trim();
  if (!text || isLoading.value) return;

  chatMsg.value = '';
  error.value = undefined;

  isLoading.value = true;

  try {
    await sendMessage(text);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};

const clearMessages = async () => {
  await deleteChat();
  await fetchChats();
  error.value = undefined;
};

const updateSidebarModel = async (value: string) => {
  modelVerified.value = null;
  await appStore.setFeatureModelRoute('sidebarAssistant', {
    selectedModelId: value,
    useRecommendedModel: false,
  });
  const ok = await appStore.verifyModelAvailability(value);
  modelVerified.value = ok;
  if (!ok) message.warning(lang.t('dataStudio.modelUnavailable'));
};
const syncAllProviderModels = () => {
  llmSettings.value.providers
    .filter(provider => provider.enabled)
    .forEach(provider => appStore.syncProviderModels(provider.id));
};

watch(
  messages,
  () => {
    scrollToBottom();
  },
  { deep: true },
);

onMounted(async () => {
  await appStore.fetchLlmSettings();
  await fetchChats();
  scrollToBottom();
});
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

.submit-button--blocked {
  opacity: 0.5;
  background: hsl(var(--destructive)) !important;
  color: hsl(var(--destructive-foreground)) !important;
  cursor: not-allowed !important;
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
