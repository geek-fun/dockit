<template>
  <task-manager-box v-if="taskManager.active" @close="closeTaskManager" />
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
          :class="{ active: item.id === selectedItemId }"
          @click="navClick(item)"
        >
          <span :class="[item.iconClass, 'h-6 w-6']" />
          <span v-if="item.id === 'task-manager' && runningTaskCount > 0" class="task-badge">
            {{ runningTaskCount > 9 ? '9+' : runningTaskCount }}
          </span>
        </div>
      </the-aside-icon>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import TheAsideIcon from './the-aside-icon.vue';
import ChatbotBox from './chatbot-box.vue';
import TaskManagerBox from './task-manager-box.vue';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useImportExportStore } from '../../store';

const importExportStore = useImportExportStore();
const { runningTaskCount } = storeToRefs(importExportStore);

const selectedItemId = ref('');
const chatBot = ref({ active: false });
const taskManager = ref({ active: false });

const navClick = async (item: { id: string }) => {
  selectedItemId.value = item.id;
  if (item.id === 'chat-bot') {
    chatBot.value.active = !chatBot.value.active;
    if (chatBot.value.active) taskManager.value.active = false;
  } else if (item.id === 'task-manager') {
    taskManager.value.active = !taskManager.value.active;
    if (taskManager.value.active) chatBot.value.active = false;
  }
};

const closeTaskManager = () => {
  taskManager.value.active = false;
  selectedItemId.value = '';
};

const smallNavList = ref([
  {
    id: 'task-manager',
    iconClass: 'i-carbon-task',
    name: 'taskManager',
  },
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
  position: relative;
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

.task-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #d03050;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1 !important;
  animation: pulse-badge 1.5s ease-in-out infinite;
}

@keyframes pulse-badge {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
}
</style>
