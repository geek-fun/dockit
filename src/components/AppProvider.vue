<template>
  <n-config-provider :theme="getTheme">
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <slot></slot>
            <NaiveProviderContent />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script lang="ts" setup>
import { useAppStore } from '@/store';
import { darkTheme } from 'naive-ui';

const appStore = useAppStore();
const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
let systemTheme = ref(themeMedia.matches)
themeMedia.addListener(e => {
  systemTheme.value = e.matches
  // if (e.matches) {
  //   document.documentElement.setAttribute('theme', 'light');
  // } else {
  //   document.documentElement.removeAttribute('theme');
  // }
});


const getTheme = computed(() => {
  console.log('系统主题是否是白色', systemTheme.value, appStore)
  let isDark = false
  if (appStore.themeType === 0) { // by System
    isDark = !systemTheme.value
  } else {
    isDark = appStore.themeType === 1
  }
  if (isDark) {
    document.documentElement.setAttribute('theme', 'dark');
    return darkTheme
  } else {
    document.documentElement.setAttribute('theme', 'light');
    return undefined
  }
});

const NaiveProviderContent = defineComponent({
  render() {
    return h('div');
  },
});
</script>
