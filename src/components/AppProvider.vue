<template>
  <div class="app-provider h-full w-full">
    <slot></slot>
    <AboutDialog ref="aboutDialog" />
    <UpgradeDialog />
    <DeviceReplaceDialog />
  </div>
</template>

<script lang="ts" setup>
import { watch, onMounted, onUnmounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  ThemeType,
  useAppStore,
  useDeviceStore,
  useEntitlementStore,
  useUserStore,
} from '../store';
import { createSessionLifecycle } from '../common';
import { useAppUpdater, useMessageService } from '@/composables';
import { lang } from '../lang';
import { resolveAvatarUrl } from '../datasources';
import AboutDialog from './AboutDialog.vue';
import UpgradeDialog from './upgrade/UpgradeDialog.vue';
import DeviceReplaceDialog from './DeviceReplaceDialog.vue';

const appStore = useAppStore();
const { setUiThemeType } = appStore;
const { uiThemeType, themeType } = storeToRefs(appStore);

const userStore = useUserStore();
const entitlementStore = useEntitlementStore();
const deviceStore = useDeviceStore();
const { checkForUpdates } = useAppUpdater();
const message = useMessageService();

const aboutDialog = ref<InstanceType<typeof AboutDialog> | null>(null);
let showAboutListener: UnlistenFn | undefined;
let checkForUpdatesListener: UnlistenFn | undefined;

const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

const sessionLifecycle = createSessionLifecycle({
  read: () => ({
    token: userStore.accessToken,
    refreshToken: userStore.refreshToken,
    revision: userStore.sessionRevision,
  }),
  authenticate: payload => {
    entitlementStore.view = null;
    entitlementStore.sessionRejections = 0;
    deviceStore.$reset();
    userStore.setAuth(
      payload.token,
      payload.username ?? '',
      payload.email ?? '',
      payload.userId ?? '',
      resolveAvatarUrl(payload.avatar ?? ''),
    );
  },
  applyRotation: payload =>
    userStore.applySessionRefresh(
      payload.previousRefreshToken,
      payload.accessToken,
      payload.refreshToken,
    ),
  seed: payload => entitlementStore.seedFromHandoff(payload),
  hydrate: () => entitlementStore.hydrate(),
  refresh: () => entitlementStore.refreshEntitlement(true),
  activate: force => deviceStore.ensureActivated(force),
  clearCache: () => entitlementStore.clearCachedEntitlement(),
  rotate: refreshToken => invoke('rotate_session_now', { refreshToken }),
  listenAuth: handler =>
    listen('dockit://auth', event => handler(event.payload as Parameters<typeof handler>[0])),
  listenRotation: handler =>
    listen('session-refreshed', event => handler(event.payload as Parameters<typeof handler>[0])),
  consumeAuth: () => invoke('consume_pending_auth'),
});

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

  checkForUpdatesListener = await listen('checkForUpdates', () => {
    checkForUpdates(true);
  });

  await sessionLifecycle.start();
});

onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
  showAboutListener?.();
  checkForUpdatesListener?.();
  sessionLifecycle.dispose();
});

// Definite session loss (lease rejected, or bearer dead without a lease) is
// resolved to the logged-out look in the store — surface the single notice.
watch(
  () => entitlementStore.sessionLostNotice,
  noticeAt => {
    if (!noticeAt) return;
    message.warning(lang.global.t('plan.section.sessionLostSignedOut'), {
      duration: 6000,
      closable: true,
    });
  },
);

watch(
  uiThemeType,
  newTheme => {
    document.documentElement.setAttribute('theme', newTheme);
  },
  { immediate: true },
);
</script>
