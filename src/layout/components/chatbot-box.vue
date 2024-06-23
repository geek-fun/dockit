<template>
  <div class="chat-box-container">
    <div class="header-title">
      {{ $t('aside.chatBot') }}
    </div>
    <div class="message-list">
      <n-scrollbar ref="scrollbarRef" style="height: 100%">
        <div v-for="msg in chats[0]?.messages" :key="msg.id">
          <div :class="['message-row', msg.role === ChatMessageRole.USER ? 'user' : '']">
            <div class="message-row-header">
              <n-icon size="26">
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
            @click="configGpt"
            strong
            secondary
            type="primary"
            >{{ $t('setting.ai.configGpt') }}
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
        />
      </div>
      <div class="footer-opration">
        <n-button type="primary" :disabled="!chatMsg" @click="submitMsg">
          <n-icon size="26">
            <SendAlt />
          </n-icon>
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Bot, SendAlt, FaceCool } from '@vicons/carbon';
import { ChatMessageRole, useChatStore } from '../../store';
import MarkdownRender from '../../components/MarkdownRender.vue';
import { ErrorCodes } from '../../common';

const chatStore = useChatStore();
const { chats } = storeToRefs(chatStore);
const { sendMessage, fetchChats } = chatStore;

const router = useRouter();

const scrollbarRef = ref(null);
const chatMsg = ref(''); // 聊天消息
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
// 提交消息
const submitMsg = () => {
  chatBotNotification.value = { enabled: false, level: undefined, message: '', code: 0 };
  if (!chatMsg.value.trim().length) return;
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
      // @ts-ignore
      scrollbarRef.value.scrollTo({ top: 999999 });
    });
  chatMsg.value = '';
};

const configGpt = () => {
  router.push({ path: '/setting', replace: true });
};

fetchChats()
  .then(() => {
    // @ts-ignore
    scrollbarRef?.value?.scrollTo({ top: 999999 });
  })
  .catch(err => {
    console.log('fetchChats error:', err.message);
    chatBotNotification.value = {
      enabled: true,
      level: 'error',
      message: err.message,
      code: err.status,
    };
  });
</script>

<style lang="scss" scoped>
.chat-box-container {
  height: 100%;
  width: 460px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);

  .header-title {
    height: 40px;
    line-height: 40px;
    padding: 0 15px;
    font-size: 18px;
    font-weight: bold;
    border-bottom: 1px solid var(--border-color);
  }

  .message-list {
    flex: 1;
    height: 0;
    padding: 10px;

    .message-row {
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      padding: 10px;

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

    .footer-opration {
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
