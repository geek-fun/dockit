<template>
  <n-config-provider :theme="getTheme" :locale="locale" :date-locale="dateLocale">
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
import { darkTheme, dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui';
import { useAppStore } from '../store';

const appStore = useAppStore();
// system theme type
const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
let systemTheme = ref(themeMedia.matches);
themeMedia.addListener(e => {
  systemTheme.value = e.matches;
});

onMounted(() => {
  let themeType: number = Number(localStorage.getItem('theme-type')) || 0;
  if (themeType !== appStore.themeType) {
    appStore.setThemeType(themeType);
  }
});

const getTheme = computed(() => {
  let isDark = appStore.themeType === 0 ? !systemTheme.value : appStore.themeType === 1;
  if (isDark) {
    document.documentElement.setAttribute('theme', 'dark');
    return darkTheme;
  } else {
    document.documentElement.setAttribute('theme', 'light');
    return undefined;
  }
});

const locale = computed(() => {
  let langType = appStore.languageName;
  return langType === 'zhCN' ? zhCN : enUS;
});
const dateLocale = computed(() => {
  let langType = appStore.languageName;
  return langType === 'zhCN' ? dateZhCN : dateEnUS;
});
const NaiveProviderContent = defineComponent({
  render() {
    return h('div');
  },
});
</script>
