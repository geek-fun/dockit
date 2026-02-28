<template>
  <div class="chat-box-container">
    <div class="chat-box-header">
      <div class="header-title">{{ $t('aside.chatBot') }}</div>
      <div>
        <span
          class="i-carbon-trash-can chat-header-delete-icon cursor-pointer"
          @click="removeChat"
        />
      </div>
    </div>
    <div class="message-list">
      <ScrollArea ref="scrollbarRef" class="h-full">
        <div v-for="msg in activeChat?.messages" :key="msg.id">
          <div :class="['message-row', msg.role === ChatMessageRole.USER ? 'user' : '']">
            <div class="message-row-header">
              <span v-if="msg.role === ChatMessageRole.BOT" class="i-carbon-bot mr-2 h-5 w-5" />
              <span v-else class="i-carbon-face-cool mr-2 h-5 w-5" />
              <span>{{ msg.role }}</span>
            </div>
            <div class="message-row-content">
              <markdown-render :markdown="msg.content" />
            </div>
          </div>
        </div>
        <div v-if="chatBotNotification.enabled">
          <Alert :variant="alertVariantMap[chatBotNotification.level || 'default']">
            <AlertDescription>{{ chatBotNotification.message }}</AlertDescription>
          </Alert>
          <br />
          <Button
            v-if="chatBotNotification.code === ErrorCodes.MISSING_GPT_CONFIG"
            variant="secondary"
            @click="configGpt"
          >
            {{ $t('setting.ai.configGpt') }}
          </Button>
        </div>
      </ScrollArea>
    </div>
    <div class="message-footer">
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
        <Button class="submit-button" :disabled="isChatMsgFinish" @click="submitMsg">
          <Spinner v-if="isChatMsgFinish" size="sm" />
          <span v-else class="i-carbon-send-alt h-6 w-6" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useAppStore, useChatStore } from '../../store';
import MarkdownRender from '../../components/markdown-render.vue';
import { ErrorCodes } from '../../common';
import { ChatMessageRole } from '../../datasources';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

const appStore = useAppStore();
const { aiConfigs } = storeToRefs(appStore);

const chatStore = useChatStore();
const { activeChat } = storeToRefs(chatStore);
const { sendMessage, fetchChats, deleteChat } = chatStore;

const router = useRouter();

const scrollbarRef = ref(null);
const chatMsg = ref('');
const isChatMsgFinish = ref(false);
const chatBotNotification = ref<{
  enabled: boolean;
  level: 'default' | 'success' | 'error' | 'warning' | 'info' | undefined;
  message: string;
  code: number;
}>({
  enabled: false,
  level: undefined,
  message: '',
  code: 0,
});

// Map alert types to shadcn-vue alert variants
const alertVariantMap: Record<string, 'default' | 'destructive' | 'success' | 'warning' | 'info'> =
  {
    default: 'default',
    success: 'success',
    error: 'destructive',
    warning: 'warning',
    info: 'info',
  };

const loadChats = async () => {
  try {
    await fetchChats();
    // @ts-ignore
    scrollbarRef?.value?.$el?.scrollTo({ top: 999999 });
  } catch (err) {
    const { details, status } = err as { details: string; status: number };
    chatBotNotification.value = {
      enabled: true,
      level: 'error',
      message: details,
      code: status,
    };
  }
};

// 提交消息
const submitMsg = () => {
  chatBotNotification.value = { enabled: false, level: undefined, message: '', code: 0 };
  if (!chatMsg.value.trim().length) return;
  isChatMsgFinish.value = true;
  sendMessage(chatMsg.value)
    .catch(err => {
      chatBotNotification.value = {
        enabled: true,
        level: 'error',
        message: err.message,
        code: 0,
      };
    })
    .finally(() => {
      isChatMsgFinish.value = false;
    });
  chatMsg.value = '';
};

const configGpt = () => {
  router.push({ path: '/setting', replace: true });
};

const removeChat = async () => {
  chatBotNotification.value = { enabled: false, level: undefined, message: '', code: 0 };
  await deleteChat();
  await loadChats();
};

watch(
  () => aiConfigs.value,
  () => {
    if (aiConfigs.value.find(({ enabled }) => enabled)) {
      chatBotNotification.value = { enabled: false, level: undefined, message: '', code: 0 };
    }
  },
);
// auto scroll to bottom when new message comes
watch(
  () => activeChat.value?.messages,
  () => {
    nextTick(() => {
      if (scrollbarRef.value) {
        // @ts-ignore
        scrollbarRef.value?.$el?.scrollTo({ top: 999999, behavior: 'smooth' });
      }
    });
  },
  { deep: true },
);

loadChats();
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
}

.message-row {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 5px;
}

.message-row.user {
  background-color: hsl(var(--background));
  border-top: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.message-row-header {
  display: flex;
  align-items: center;
}

.message-row-header span {
  font-weight: bold;
}

.message-row-header :deep(.inline-flex) {
  margin-right: 10px;
}

.message-row-content pre {
  width: 100%;
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  text-wrap: wrap;
}

.message-footer {
  padding: 0 10px 10px 10px;
  position: relative;
  z-index: 1;
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
</style>
