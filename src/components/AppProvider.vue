<template>
  <div class="app-provider h-full w-full">
    <slot></slot>
    <AboutDialog ref="aboutDialog" />
  </div>
</template>

<script lang="ts" setup>
import { watch, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ThemeType, useAppStore, useUserStore } from '../store';
import { router } from '../router';
import { parseDeepLinkUrl } from '../datasources/authService';
import { useAppUpdater } from '@/composables';
import AboutDialog from './AboutDialog.vue';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { uiThemeType, themeType } = storeToRefs(appStore);

const userStore = useUserStore();
const { checkForUpdates } = useAppUpdater();

const aboutDialog = ref<InstanceType<typeof AboutDialog> | null>(null);
let showAboutListener: UnlistenFn | undefined;
let checkForUpdatesListener: UnlistenFn | undefined;
let unlistenAuth: UnlistenFn | undefined;
let unlistenDeepLink: UnlistenFn | undefined;
let unlistenTauriEvent: UnlistenFn | undefined;

// System theme preference detection
const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

const handleSystemThemeChange = (event: MediaQueryListEvent | MediaQueryList) => {
  setUiThemeType(event.matches ? ThemeType.LIGHT : ThemeType.DARK);
};

// Handle incoming deep link URLs (dockit://auth?token=...)
const handleDeepLink = (urls: string[]) => {
  for (const url of urls) {
    const authData = parseDeepLinkUrl(url);
    if (authData) {
      userStore.setAuthFromCallback(authData);
      router.push('/');
      return;
    }
  }
};

// Initialize theme on mount
onMounted(async () => {
  // Only follow system preference when in AUTO mode
  if (themeType.value === ThemeType.AUTO) {
    handleSystemThemeChange(sysPreferLight);
    sysPreferLight.addEventListener('change', handleSystemThemeChange);
  }

  // Register deep link listener for new app launches via dockit:// URL
  try {
    unlistenDeepLink = await onOpenUrl((urls: string[]) => {
      handleDeepLink(urls);
    });
  } catch (error) {
    console.error('Failed to register deep link listener:', error);
  }

  // Register listener for when app is already running (single-instance plugin emits this event)
  try {
    unlistenTauriEvent = await listen<string>('deep-link-received', event => {
      handleDeepLink([event.payload]);
    });
  } catch (error) {
    console.error('Failed to register deep-link-received event listener:', error);
  }

  showAboutListener = await listen('showAbout', () => {
    aboutDialog.value?.show();
  });

  checkForUpdatesListener = await listen('checkForUpdates', () => {
    checkForUpdates(true);
  });

  unlistenAuth = await listen<{
    token: string;
    userId?: string;
    username?: string;
    email?: string;
    avatar?: string;
  }>('dockit://auth', event => {
    userStore.setAuthFromCallback(event.payload);
    router.push('/');
  });
});

// Cleanup listeners on unmount
onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
  showAboutListener?.();
  checkForUpdatesListener?.();
  unlistenAuth?.();
  unlistenDeepLink?.();
  unlistenTauriEvent?.();
});

watch(
  uiThemeType,
  newTheme => {
    document.documentElement.setAttribute('theme', newTheme);
  },
  { immediate: true },
);
</script>
