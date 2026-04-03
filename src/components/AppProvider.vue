<template>
  <div class="app-provider h-full w-full">
    <slot></slot>
    <AboutDialog ref="aboutDialog" />
  </div>
</template>

<script lang="ts" setup>
import { watch, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ThemeType, useAppStore, useUserStore } from '../store';
import AboutDialog from './AboutDialog.vue';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { uiThemeType, themeType } = storeToRefs(appStore);

const userStore = useUserStore();

const aboutDialog = ref<InstanceType<typeof AboutDialog> | null>(null);
let showAboutListener: UnlistenFn | undefined;
let unlistenAuth: UnlistenFn | undefined;

const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

const handleSystemThemeChange = (event: MediaQueryListEvent | MediaQueryList) => {
  setUiThemeType(event.matches ? ThemeType.LIGHT : ThemeType.DARK);
};

onMounted(async () => {
  if (themeType.value === ThemeType.AUTO) {
    handleSystemThemeChange(sysPreferLight);
    sysPreferLight.addEventListener('change', handleSystemThemeChange);
  }

  showAboutListener = await listen('showAbout', () => {
    aboutDialog.value?.show();
  });

  unlistenAuth = await listen<{ token: string; username: string; email: string }>(
    'dockit://auth',
    event => {
      userStore.setAuth(event.payload.token, event.payload.username, event.payload.email);
    },
  );
});

onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
  showAboutListener?.();
  unlistenAuth?.();
});

watch(
  uiThemeType,
  newTheme => {
    document.documentElement.setAttribute('theme', newTheme);
  },
  { immediate: true },
);
</script>
