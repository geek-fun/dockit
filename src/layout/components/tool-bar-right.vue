<template>
  <chatbot-box v-if="chatBot.active" />
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
import { ChatBot } from '@vicons/carbon';
import { useLang } from './../../lang'
import TheAsideIcon from './the-aside-icon.vue';
import ChatbotBox from './chatbot-box.vue';

const lang = useLang();
const message = useMessage();

const selectedItemId = ref(-1);
const chatBot = ref({ active: false });

const navClick = async (item: any) => {
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
</style>
s
