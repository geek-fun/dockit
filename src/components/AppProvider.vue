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
import { shouldRotateToken } from '../common';
import { useAppUpdater } from '@/composables';
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

const aboutDialog = ref<InstanceType<typeof AboutDialog> | null>(null);
let showAboutListener: UnlistenFn | undefined;
let checkForUpdatesListener: UnlistenFn | undefined;
let unlistenAuth: UnlistenFn | undefined;
let unlistenSessionRefresh: UnlistenFn | undefined;

const sysPreferLight = window.matchMedia('(prefers-color-scheme: light)');

type AuthPayload = {
  token: string;
  username?: string | null;
  email?: string | null;
  userId?: string | null;
  avatar?: string | null;
  // Entitlement snapshot from the web handoff — lets the app show the plan
  // instantly, before the first subscription round-trip completes.
  ultimateExpiresAt?: string | null;
  versionLockHorizon?: string | null;
  cancelScheduledAt?: string | null;
};

// Idempotent: events and the cold-start pull may both deliver the same link.
const handleAuth = (payload: AuthPayload) => {
  userStore.setAuth(
    payload.token,
    payload.username ?? '',
    payload.email ?? '',
    payload.userId ?? '',
    resolveAvatarUrl(payload.avatar ?? ''),
  );
  entitlementStore.seedFromHandoff(payload);
  entitlementStore.refreshEntitlement(true);
  // geekfun#59: the deep-linked token comes from a web login with no
  // device attached — register/verify this machine right away.
  deviceStore.ensureActivated(true);
};

// Rotate an expired or near-expiry access token before anything uses it:
// one round trip now beats a 401 on every subsequent call. The returned
// pair is stored directly (not only via the event) so ordering with the
// entitlement refresh below is deterministic.
const rotateStaleSession = async () => {
  if (
    !userStore.refreshToken ||
    !shouldRotateToken(userStore.accessToken, userStore.refreshToken)
  ) {
    return;
  }
  try {
    const refreshed = await invoke<{ access_token: string; refresh_token: string }>(
      'rotate_session_now',
      { refreshToken: userStore.refreshToken },
    );
    userStore.setToken(refreshed.access_token);
    userStore.setRefreshToken(refreshed.refresh_token);
  } catch {
    // rejected or transient — the reactive 401 paths still recover
  }
};

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

  // Listeners must exist before the pending-auth pull below.
  unlistenAuth = await listen<AuthPayload>('dockit://auth', event => {
    handleAuth(event.payload);
  });

  // Transparent session refresh (Rust rotates the lease): keep the frontend
  // copy of both tokens in sync.
  unlistenSessionRefresh = await listen<{ accessToken: string; refreshToken: string }>(
    'session-refreshed',
    event => {
      userStore.setToken(event.payload.accessToken);
      userStore.setRefreshToken(event.payload.refreshToken);
    },
  );

  if (userStore.isLoggedIn) {
    // Cached last success first — the UI must not flash Unknown while the
    // network refresh below is in flight. A stale token is rotated before
    // the refresh so it goes out with a valid bearer.
    await entitlementStore.hydrate();
    await rotateStaleSession();
    entitlementStore.refreshEntitlement(true);
    deviceStore.ensureActivated();
  }

  // Cold start: a deep link can arrive before these listeners exist — Rust
  // parks it in pending state; consume it now.
  try {
    const pending = await invoke<AuthPayload | null>('consume_pending_auth');
    if (pending) {
      handleAuth(pending);
    }
  } catch {
    // no pending auth is the normal case
  }
});

onUnmounted(() => {
  sysPreferLight.removeEventListener('change', handleSystemThemeChange);
  showAboutListener?.();
  checkForUpdatesListener?.();
  unlistenAuth?.();
  unlistenSessionRefresh?.();
});

watch(
  uiThemeType,
  newTheme => {
    document.documentElement.setAttribute('theme', newTheme);
  },
  { immediate: true },
);
</script>
