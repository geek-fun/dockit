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
            <span :class="[item.iconClass, 'h-6 w-6']" />
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
            <span :class="[item.iconClass, 'h-6 w-6']" />
          </div>
        </the-aside-icon>
      </div>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { open } from '@tauri-apps/plugin-shell';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from '../../store';
import TheAsideIcon from './the-aside-icon.vue';
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
    iconClass: 'i-carbon-equalizer',
    isLink: false,
  },
  {
    id: 'connect',
    path: '/connect',
    name: 'connect',
    iconClass: 'i-carbon-data-base',
    isLink: false,
  },
  {
    id: 'file',
    path: '/file',
    name: 'file',
    iconClass: 'i-carbon-folders',
    isLink: false,
  },
  {
    id: 'history',
    path: '/history',
    name: 'history',
    iconClass: 'i-carbon-expand-all',
    isLink: false,
  },
  {
    id: 'import-export',
    path: '/import-export',
    name: 'importExport',
    iconClass: 'i-carbon-import-export',
    isLink: false,
  },
  {
    id: 'github',
    path: '',
    name: 'github',
    iconClass: 'i-carbon-logo-github',
    isLink: true,
  },
]);

const samllNavList = ref([
  {
    path: '/',
    id: 'user',
    iconClass: 'i-carbon-user-avatar',
    name: 'user',
    isLink: false,
  },
  {
    path: '/setting',
    id: 'setting',
    iconClass: 'i-carbon-settings',
    name: 'setting',
    isLink: false,
  },
]);

interface RouteItem {
  path: string;
  id: string;
  iconClass: string;
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
  border-right: 1px solid hsl(var(--border));
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

.icon-item.active::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 5px;
  background-color: hsl(var(--border));
}

.icon-item.active :deep(span) {
  opacity: 1;
}

.icon-item:hover :deep(span) {
  opacity: 0.9;
}
</style>
