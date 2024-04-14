<template>
  <n-card
    v-if="chatBot.active"
    class="chat-box-container"
    :title="$t('aside.chatBot')"
    content-class="chat-box-content"
    :segmented="{
      content: true,
      footer: 'segmented',
    }"
  >
    <template #header-extra></template>
    <div class="message-list-box">
      <n-scrollbar :style="scrollBarStyle">
        <div v-for="msg in messages" :key="msg.id">
          <pre v-text="msg.content"></pre>
        </div>
      </n-scrollbar>
    </div>
    <template #footer>
      <div class="message-box">
        <n-input
          v-model:value="message"
          type="textarea"
          :autosize="{
            minRows: 3,
          }"
          placeholder="Type your message here..."
        />
        <n-button-group class="message-action-box">
          <n-button text>
            <template #icon></template>
          </n-button>
          <n-button text @click="submitMsg">
            <template #icon>
              <n-icon size="26">
                <send-alt />
              </n-icon>
            </template>
          </n-button>
        </n-button-group>
      </div>
    </template>
  </n-card>
  <div class="tool-bar-right">
    <the-aside-icon
      v-for="item in smallNavList"
      :key="item.id"
      :popover-content="$t(`aside.${item.name}`)"
    >
      <div
        class="icon-item"
        :class="{ active: item.id === `${selectedItemId}` }"
        @click="navClick(item)"
      >
        <n-icon size="26">
          <component :is="item.icon" />
        </n-icon>
      </div>
    </the-aside-icon>
  </div>
</template>

<script setup lang="ts">
import { markRaw, ref } from 'vue';
import { ChatBot, SendAlt } from '@vicons/carbon';
import TheAsideIcon from './the-aside-icon.vue';
import { useChatStore } from '../../store';

const chatStore = useChatStore();
const { sendMessage } = chatStore;
const { messages } = toRefs(chatStore);

const selectedItemId = ref(-1);
const chatBot = ref({ active: false });

const navClick = (item: any) => {
  selectedItemId.value = item.id;
  if (item.id === 'chat-bot') {
    chatBot.value.active = !chatBot.value.active;
  }
};

const smallNavList = ref([
  {
    id: 'chat-bot',
    icon: markRaw(ChatBot),
    name: 'chatBot',
  },
]);

const message = ref(''); // to hold the message

const submitMsg = async () => {
  if (message.value.trim().length < 1) return;
  await sendMessage(message.value);
  console.log('submitMsg', message.value);
  message.value = '';
};

const msgBoxHeight = ref(449);
const scrollBarStyle = computed(() => `max-height: ${msgBoxHeight.value}px`);
console.log('msgBoxHeight', msgBoxHeight);
// Function to update window's height
const updateHeight = () => {
  if (chatBot.value.active) {
    const chatMsgContent = document.querySelector('.chat-box-container .message-list-box');
    msgBoxHeight.value = chatMsgContent.clientHeight;
  }
};

onMounted(() => {
  window.addEventListener('resize', updateHeight);
  updateHeight();
});

onUnmounted(() => {
  window.removeEventListener('resize', updateHeight);
});
</script>

<style scoped>
.tool-bar-right {
  --aside-width: 40px;
  width: var(--aside-width);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);

  .icon-item {
    height: var(--aside-width);
    margin: 10px 0;
    display: flex;
    box-sizing: border-box;
    justify-content: center;
    align-items: center;
    color: var(--text-color);
    cursor: pointer;

    .n-icon {
      opacity: 0.4;
      transition: 0.3s;
    }

    &.active {
      position: relative;

      .n-icon {
        opacity: 1;
      }
    }

    &:hover {
      .n-icon {
        opacity: 0.9;
      }
    }
  }
}

.chat-box-container {
  width: 500px;
  .n-card__content {
    margin: 0;
    padding: 0;
  }
  .message-list-box {
    height: 100%;
    padding: 0;
    margin: 0;
  }
  .message-box {
    background-color: var(--border-color);

    .message-action-box {
      display: flex;
      justify-content: space-between;
      height: 20px;
      padding: 10px;
    }
  }
}
</style>
