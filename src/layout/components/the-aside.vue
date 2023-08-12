<template>
  <div class="left-aside">
    <div class="main-nav">
      <the-aside-icon v-for="item in mainNavList" :key="item.path" :popover-content="item.name">
        <div
          class="icon-item"
          :class="{
            active: isActive(item),
          }"
          @click="navClick(item)"
        >
          <n-icon size="26">
            <component :is="item.icon" />
          </n-icon>
        </div>
      </the-aside-icon>
    </div>
    <div class="samll-nav">
      <the-aside-icon v-for="item in samllNavList" :key="item.path" :popover-content="item.name">
        <div
          class="icon-item"
          :class="{
            active: isActive(item),
          }"
          @click="navClick(item)"
        >
          <n-icon size="26">
            <component :is="item.icon" />
          </n-icon>
        </div>
      </the-aside-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { DataBase, Folders, LogoGithub, Settings, UserAvatar } from '@vicons/carbon';
import { useLang } from './../../lang';
import { useAppStore } from './../../store';
import theAsideIcon from './the-aside-icon.vue';
const lang = useLang();
const router = useRouter();
const route = useRoute();
const appStore = useAppStore();

const mainNavList = ref([
  {
    id: 'connect',
    path: '/connect',
    name: lang.t('aside.connect'),
    icon: markRaw(DataBase),
    isLink: false,
  },
  {
    id: 'file',
    path: '/',
    name: lang.t('aside.file'),
    icon: markRaw(Folders),
    isLink: false,
  },
  {
    id: 'github',
    path: '',
    name: lang.t('aside.github'),
    icon: markRaw(LogoGithub),
    isLink: true,
  },
]);

const samllNavList = ref([
  {
    path: '/',
    id: 'user',
    icon: markRaw(UserAvatar),
    name: lang.t('aside.user'),
    isLink: false,
  },
  {
    path: '/setting',
    id: 'setting',
    icon: markRaw(Settings),
    name: lang.t('aside.setting'),
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
    window.electronAPI.openGitHub();
  } else {
    if (route.path === item.path) {
      appStore.setConnectPannel();
    } else {
      router.push({
        path: item.path,
      });
    }
  }
};
</script>

<style lang="scss" scoped>
.left-aside {
  --aside-width: 60px;
  width: var(--aside-width);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  .main-nav {
    flex: 1;
    height: 0;
  }
  .icon-item {
    height: var(--aside-width);
    height: 50px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: var(--text-color);
    .n-icon {
      cursor: pointer;
      opacity: 0.4;
      transition: 0.3s;
    }
    &.active {
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
