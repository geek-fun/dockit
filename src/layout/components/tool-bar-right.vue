<template>
  <chatbot-box v-if="chatBot.active" />
  <div class="tool-bar-right">
    <TooltipProvider>
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
          <span :class="[item.iconClass, 'h-6 w-6']" />
        </div>
      </the-aside-icon>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TheAsideIcon from './the-aside-icon.vue';
import ChatbotBox from './chatbot-box.vue';
import { TooltipProvider } from '@/components/ui/tooltip';

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
    iconClass: 'i-carbon-chat-bot',
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
  border-left: 1px solid hsl(var(--border));
}

.icon-item {
  height: var(--aside-width);
  margin: 10px 0;
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.icon-item :deep(span) {
  opacity: 0.4;
  transition: 0.3s;
}

.icon-item.active {
  position: relative;
}

.icon-item.active :deep(span) {
  opacity: 1;
}

.icon-item:hover :deep(span) {
  opacity: 0.9;
}
</style>
