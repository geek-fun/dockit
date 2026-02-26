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
 * The theming system uses CSS custom properties defined in:
 * - src/assets/styles/index.css (theme CSS variables)
 * - src/assets/styles/theme.scss (legacy DocKit variables)
 *
 * Dark/light mode is controlled by the [theme] attribute on the root element,
 * which toggles CSS variable values for both systems.
 *
 * For messaging and dialogs, use the composables:
 * - useMessageService() for toast notifications
 * - useDialogService() for confirmation dialogs
 * - useLoadingBarService() for loading indicators
 */
import { watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { ThemeType, useAppStore } from '../store';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { uiThemeType } = storeToRefs(appStore);

// System theme preference detection
const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

// Handler for system theme changes
const handleSystemThemeChange = (event: MediaQueryListEvent | MediaQueryList) => {
  setUiThemeType(event.matches ? ThemeType.LIGHT : ThemeType.DARK);
};

// Initialize theme on mount
onMounted(() => {
  // Set initial theme based on system preference
  handleSystemThemeChange(sysPreferLight);

  // Listen for system theme changes
  sysPreferLight.addEventListener('change', handleSystemThemeChange);
});

// Cleanup listener on unmount
onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
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
