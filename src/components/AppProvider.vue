<template>
  <div class="app-provider h-full w-full">
    <slot></slot>
  </div>
</template>

<script lang="ts" setup>
/**
 * AppProvider Component
 *
 * This component provides application-level context and theming.
 * It manages:
 * - Theme switching (light/dark mode via CSS custom properties and [theme] attribute)
 * - System preference detection for automatic theme switching
 *
 * Dark/light mode is controlled by the [theme] attribute on the root element,
 * which toggles CSS variable values.
 *
 *
 * For messaging and dialogs, use the composables:
 * - useMessageService() for toast notifications
 * - useDialogService() for confirmation dialogs
 * - useLoadingBarService() for loading indicators
 */
import { watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { listen } from '@tauri-apps/api/event';
import { ThemeType, useAppStore } from '../store';
import { useUserStore } from '../store';
import { router } from '../router';
import { parseDeepLinkUrl } from '../datasources/authService';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { uiThemeType, themeType } = storeToRefs(appStore);

const userStore = useUserStore();

// System theme preference detection
const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

// Handler for system theme changes
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

let unlistenDeepLink: (() => void) | null = null;
let unlistenTauriEvent: (() => void) | null = null;

// Initialize theme on mount
onMounted(async () => {
  // Only follow system preference when in AUTO mode
  if (themeType.value === ThemeType.AUTO) {
    // Set initial theme based on system preference
    handleSystemThemeChange(sysPreferLight);

    // Listen for system theme changes
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
});

// Cleanup listeners on unmount
onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
  if (unlistenDeepLink) unlistenDeepLink();
  if (unlistenTauriEvent) unlistenTauriEvent();
});

// Watch for theme changes and update the DOM attribute
watch(
  uiThemeType,
  newTheme => {
    document.documentElement.setAttribute('theme', newTheme);
  },
  { immediate: true },
);
</script>
