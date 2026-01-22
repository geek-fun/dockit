<template>
  <div class="chat-box-container">
    <div class="chat-box-header">
      <div class="header-title">{{ $t('aside.chatBot') }}</div>
      <div>
        <n-icon class="chat-header-delete-icon">
          <Delete @click="removeChat" />
        </n-icon>
      </div>
    </div>
    <div class="message-list">
      <n-scrollbar ref="scrollbarRef" style="height: 100%">
        <div v-for="msg in activeChat?.messages" :key="msg.id">
          <div :class="['message-row', msg.role === ChatMessageRole.USER ? 'user' : '']">
            <div class="message-row-header">
              <n-icon size="20">
                <bot v-if="msg.role === ChatMessageRole.BOT" />
                <face-cool v-else />
              </n-icon>
              <span>{{ msg.role }}</span>
            </div>
            <div class="message-row-content">
              <markdown-render :markdown="msg.content" />
            </div>
          </div>
        </div>
        <div v-if="chatBotNotification.enabled">
          <n-alert :type="chatBotNotification.level">
            {{ chatBotNotification.message }}
          </n-alert>
          <br />
          <n-button
            v-if="chatBotNotification.code === ErrorCodes.MISSING_GPT_CONFIG"
            strong
            secondary
            type="primary"
            @click="configGpt"
          >
            {{ $t('setting.ai.configGpt') }}
          </n-button>
        </div>
      </n-scrollbar>
    </div>
    <div class="message-footer">
      <div class="chat-input">
        <n-input
          v-model:value="chatMsg"
          type="textarea"
          :autosize="{
            minRows: 3,
            maxRows: 6,
          }"
          placeholder="Type your message here..."
          :input-props="inputProps"
        />
      </div>
      <div class="footer-operation">
        <n-button
          type="primary"
          :loading="isChatMsgFinish"
          :disabled="isChatMsgFinish"
          @click="submitMsg"
        >
          <template #icon>
            <n-icon size="26">
              <SendAlt />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Bot, SendAlt, FaceCool } from '@vicons/carbon';
import { useAppStore, useChatStore } from '../../store';
import MarkdownRender from '../../components/markdown-render.vue';
import { ErrorCodes, inputProps } from '../../common';
import { ChatMessageRole } from '../../datasources';
import { Delete } from '@vicons/carbon';

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

const loadChats = async () => {
  try {
    await fetchChats();
    // @ts-ignore
    scrollbarRef?.value?.scrollTo({ top: 999999 });
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
        scrollbarRef.value.scrollTo({ top: 999999, behavior: 'smooth' });
      }
    });
  },
  { deep: true },
);

loadChats();
</script>

<style lang="scss" scoped>
.chat-box-container {
  height: 100%;
  width: 460px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);

  .chat-box-header {
    height: 40px;
    line-height: 40px;
    padding: 0 15px;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-color);

    .header-title {
      font-size: 18px;
      font-weight: bold;
    }

    .chat-header-delete-icon {
      cursor: pointer;
    }
  }

  .message-list {
    flex: 1;
    height: 0;

    .message-row {
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      padding: 5px;

      &.user {
        background-color: var(--bg-color);
        border-top: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
      }

      &-header {
        display: flex;
        align-items: center;

        span {
          font-weight: bold;
        }

        .n-icon {
          margin-right: 10px;
        }
      }

      &-content {
        pre {
          width: 100%;
          margin: 0;
          padding: 0;
          white-space: pre-wrap;
          text-wrap: wrap;
        }
      }
    }
  }

  .message-footer {
    padding: 0 10px 10px 10px;
    position: relative;
    z-index: 1;

    .chat-input {
      height: fit-content;
    }

    .footer-operation {
      position: absolute;
      bottom: 13px;
      right: 13px;
      z-index: 2;
      height: 30px;

      .n-button {
        width: 40px;
        height: 100%;
        padding: 0;
        margin: 0;
        color: #fff;
      }
    }
  }
}
</style>
