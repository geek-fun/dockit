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
            role="button"
            tabindex="0"
            @click="navClick(item)"
            @keydown.enter="navClick(item)"
            @keydown.space.prevent="navClick(item)"
          >
            <span :class="[item.iconClass, 'h-6 w-6']" />
            <ProBadge v-if="showProDot(item)" size="dot" class="icon-pro-dot" />
          </div>
        </the-aside-icon>
      </div>
      <div class="samll-nav">
        <user-chip />
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
            role="button"
            tabindex="0"
            @click="navClick(item)"
            @keydown.enter="navClick(item)"
            @keydown.space.prevent="navClick(item)"
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
import { useAppStore, useEntitlementStore } from '../../store';
import TheAsideIcon from './the-aside-icon.vue';
import UserChip from './user-chip.vue';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProBadge } from '@/components/upgrade';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const entitlementStore = useEntitlementStore();
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
    id: 'data-studio',
    path: '/data-studio',
    name: 'dataStudio',
    iconClass: 'i-carbon-ibm-watsonx-assistant',
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

const gatedNavIds = new Set(['manage', 'data-studio', 'import-export']);

const showProDot = (item: RouteItem) =>
  !entitlementStore.isLocalUltimate && gatedNavIds.has(item.id);

const isActive = (item: RouteItem) => {
  if (!item.path || item.isLink) return false;
  return route.path === item.path || route.path.startsWith(item.path + '/');
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
  position: relative;
  height: 40px;
  margin: 10px 0;
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.icon-pro-dot {
  position: absolute;
  top: 5px;
  right: 7px;
}

.icon-item > span:first-child {
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

.icon-item.active > span:first-child {
  opacity: 1;
}

.icon-item:hover > span:first-child {
  opacity: 0.9;
}
</style>
