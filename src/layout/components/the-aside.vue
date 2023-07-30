<template>
  <div class="left-aside">
    <div class="nav-list">
      <the-aside-icon popover-content="连接">
        <div class="icon-item" @click="connectClick">
          <n-icon size="26">
            <DataBase />
          </n-icon>
        </div>
      </the-aside-icon>
      <the-aside-icon popover-content="文件">
        <div class="icon-item" @click="fileClick">
          <n-icon size="26">
            <Folders />
          </n-icon>
        </div>
      </the-aside-icon>
      <the-aside-icon popover-content="GitHub">
        <div class="icon-item" @click="linkToGitHub">
          <n-icon size="26">
            <LogoGithub />
          </n-icon>
        </div>
      </the-aside-icon>
    </div>
    <the-aside-icon popover-content="用户">
      <div class="icon-item" @click="userClick">
        <n-icon size="26">
          <UserAvatar />
        </n-icon>
      </div>
    </the-aside-icon>
    <the-aside-icon popover-content="设置">
      <div class="icon-item" @click="settingClick">
        <n-icon size="26">
          <Settings />
        </n-icon>
      </div>
    </the-aside-icon>
  </div>
</template>

<script setup lang="ts">
import { DataBase, Folders, LogoGithub, Settings, UserAvatar } from '@vicons/carbon';
import theAsideIcon from './the-aside-icon.vue';

const router = useRouter();
// open github lint at default Browser
const linkToGitHub = () => {};
// TODO: connect icon click handle
const connectClick = () => {
  router.push({
    path: '/',
  });
};
// TODO: file icon click handle
const fileClick = () => {};
// TODO: user icon click handle
const userClick = () => {
  router.push({
    path: '/',
  });
};
// TODO: setting icon click handle
const settingClick = () => {
  router.push({
    path: '/setting',
  });
};
</script>

<style lang="scss" scoped>
.left-aside {
  --aside-width: 60px;
  width: var(--aside-width);
  padding: 10px 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  .nav-list {
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
      opacity: 0.5;
      transition: 0.3s;
    }
    &:hover {
      .n-icon {
        opacity: 0.9;
      }
    }
  }
}
</style>
