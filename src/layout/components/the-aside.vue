<template>
  <div class="left-aside">
    <TooltipProvider>
      <div class="main-nav">
        <the-aside-icon
          v-for="item in mainNavList"
          :key="item.path"
          :popover-content="$t(`aside.${item.name}`)"
        >
          <div
            class="icon-item"
            :class="{
              active: isActive(item),
            }"
            @click="navClick(item)"
          >
            <Icon :size="26">
              <component :is="item.icon" />
            </Icon>
          </div>
        </the-aside-icon>
      </div>
      <div class="samll-nav">
        <the-aside-icon
          v-for="item in samllNavList"
          :key="item.path"
          :popover-content="$t(`aside.${item.name}`)"
        >
          <div
            class="icon-item"
            :class="{
              active: isActive(item),
            }"
            @click="navClick(item)"
          >
            <Icon :size="26">
              <component :is="item.icon" />
            </Icon>
          </div>
        </the-aside-icon>
      </div>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw } from 'vue';
import { open } from '@tauri-apps/plugin-shell';
import { useRouter, useRoute } from 'vue-router';
import {
  DataBase,
  Folders,
  LogoGithub,
  Settings,
  UserAvatar,
  ExpandAll,
  Equalizer,
  ImportExport,
} from '@vicons/carbon';
import { useAppStore } from '../../store';
import TheAsideIcon from './the-aside-icon.vue';
import { Icon } from '@/components/ui/icon';
import { TooltipProvider } from '@/components/ui/tooltip';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const { setConnectPanel } = appStore;

const mainNavList = ref([
  {
    id: 'manage',
    path: '/manage',
    name: 'manage',
    icon: markRaw(Equalizer),
    isLink: false,
  },
  {
    id: 'connect',
    path: '/connect',
    name: 'connect',
    icon: markRaw(DataBase),
    isLink: false,
  },
  {
    id: 'file',
    path: '/file',
    name: 'file',
    icon: markRaw(Folders),
    isLink: false,
  },
  {
    id: 'history',
    path: '/history',
    name: 'history',
    icon: markRaw(ExpandAll),
    isLink: false,
  },
  {
    id: 'import-export',
    path: '/import-export',
    name: 'importExport',
    icon: markRaw(ImportExport),
    isLink: false,
  },
  {
    id: 'github',
    path: '',
    name: 'github',
    icon: markRaw(LogoGithub),
    isLink: true,
  },
]);

const samllNavList = ref([
  {
    path: '/',
    id: 'user',
    icon: markRaw(UserAvatar),
    name: 'user',
    isLink: false,
  },
  {
    path: '/setting',
    id: 'setting',
    icon: markRaw(Settings),
    name: 'setting',
    isLink: false,
  },
]);

interface RouteItem {
  path: string;
  id: string;
  icon: Component;
  name: string;
  isLink: boolean;
}

const isActive = (item: RouteItem) => {
  return item.path === route.path;
};
// nav click handler method
const navClick = (item: RouteItem) => {
  if (item.isLink && item.id === 'github') {
    open('https://github.com/geek-fun/dockit');
  } else {
    if (route.path === item.path) {
      setConnectPanel();
    } else {
      router.push({
        path: item.path,
      });
    }
  }
};
</script>

<style scoped>
.left-aside {
  --aside-width: 60px;
  width: var(--aside-width);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.main-nav {
  flex: 1;
  height: 0;
}

.icon-item {
  height: 40px;
  margin: 10px 0;
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  color: var(--text-color);
  cursor: pointer;
}

.icon-item :deep(span) {
  opacity: 0.4;
  transition: 0.3s;
}

.icon-item.active {
  position: relative;
}

.icon-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 5px;
  background-color: var(--border-color);
}

.icon-item.active :deep(span) {
  opacity: 1;
}

.icon-item:hover :deep(span) {
  opacity: 0.9;
}
</style>
