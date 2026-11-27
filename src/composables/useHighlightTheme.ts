import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAppStore } from '@/store';

let highlightLink: HTMLLinkElement | null = null;
let activeTheme: string | null = null;

const applyHighlightTheme = async (theme: string) => {
  if (typeof document === 'undefined' || activeTheme === theme) return;
  activeTheme = theme;
  try {
    const mod =
      theme === 'dark'
        ? await import('highlight.js/styles/atom-one-dark.css?url')
        : await import('highlight.js/styles/atom-one-light.css?url');
    if (activeTheme !== theme) return;
    if (!highlightLink) {
      highlightLink = document.createElement('link');
      highlightLink.rel = 'stylesheet';
      document.head.appendChild(highlightLink);
    }
    highlightLink.href = mod.default;
  } catch {
    // Non-browser / test environments without CSS ?url loader
  }
};

export const useHighlightTheme = () => {
  const appStore = useAppStore();
  const { uiThemeType } = storeToRefs(appStore);
  watch(
    () => uiThemeType.value,
    theme => {
      void applyHighlightTheme(theme);
    },
    { immediate: true },
  );
};
