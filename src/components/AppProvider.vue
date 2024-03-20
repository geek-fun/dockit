<template>
  <n-config-provider
    :theme="getTheme"
    :locale="locale"
    :date-locale="dateLocale"
    :theme-overrides="naiveThemeOverrides"
  >
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
import { computed, defineComponent, h } from 'vue';
import { darkTheme, dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui';
import { storeToRefs } from 'pinia';
import { LanguageType, ThemeType, useAppStore } from '../store';
import { naiveThemeOverrides } from '../assets/theme/naive-theme-overrides';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { languageType, uiThemeType } = storeToRefs(appStore);

// system theme type
const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');
setUiThemeType(sysPreferLight.matches ? ThemeType.LIGHT : ThemeType.DARK);
sysPreferLight.addListener(event =>
  setUiThemeType(event.matches ? ThemeType.LIGHT : ThemeType.DARK),
);

const getTheme = computed(() => {
  document.documentElement.setAttribute('theme', uiThemeType.value);
  return uiThemeType.value === ThemeType.DARK ? darkTheme : undefined;
});

const locale = computed(() => (languageType.value === LanguageType.ZH_CN ? zhCN : enUS));
const dateLocale = computed(() =>
  languageType.value === LanguageType.ZH_CN ? dateZhCN : dateEnUS,
);

const NaiveProviderContent = defineComponent({
  render() {
    return h('div');
  },
});
</script>
