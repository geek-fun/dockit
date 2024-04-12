<template>
  <n-card
    v-if="chatBot.active"
    class="chat-box-container"
    :title="$t('aside.chatBot')"
    :segmented="{
      content: true,
      footer: 'segmented',
    }"
  >
    <template #header-extra></template>
    Card Content
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
            <template #icon> </template>
          </n-button>
          <n-button text @click="sendMessage">
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

const sendMessage = () => {
  if (message.value.trim() !== '') {
    console.log(message.value); // replace this with your actual send message logic
    message.value = ''; // clear the input after sending the message
  }
};
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
