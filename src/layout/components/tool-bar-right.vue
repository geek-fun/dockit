<template>
  <div class="tool-bar-right">
    <the-aside-icon
      v-for="item in samllNavList"
      :key="item.path"
      :popover-content="$t(`aside.${item.name}`)"
    >
      <div
        class="icon-item"
        :class="{
          active: item.id === selectedItemId,
        }"
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

import { DataBase, ExpandAll, Folders, LogoGithub, Settings, UserAvatar } from '@vicons/carbon';

const selectedItemId = ref(-1);

const navClick = (item: any) => {
  selectedItemId.value = item.id;
};

const mainNavList = ref([
  {
    id: 'connect',
    path: '/connect',
    name: 'connect',
    icon: markRaw(DataBase),
    isLink: false,
  },
  {
    id: 'file',
    path: '/',
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
</script>

<style scoped>
.tool-bar-right {
  --aside-width: 60px;
  width: var(--aside-width);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  .icon-item {
    height: var(--aside-width);
    height: 40px;
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
      &::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 5px;
        background-color: var(--border-color);
      }
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
