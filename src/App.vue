<template>
  <app-provider>
    <router-main />
    <version-detect />
  </app-provider>
</template>

<script setup lang="ts">
import { listen } from '@tauri-apps/api/event';
import { onMounted, onBeforeUnmount } from 'vue';
import AppProvider from './components/AppProvider.vue';
import RouterMain from './components/RouterMain.vue';
import VersionDetect from './components/VersionDetect.vue';
import { openUpgradeDialog } from '@/components/upgrade/upgradeDialogService';
import { initAgentRuntime, disposeAgentRuntime } from '@/composables/agentRuntime';
import { useAppStore } from '@/store';

// Tray → "Stopped (subscription required)" opens the upgrade dialog.
const unlistenSubscription = listen('mcp-bridge://subscription', () =>
  openUpgradeDialog('mcp_bridge'),
);

onMounted(async () => {
  void initAgentRuntime();
  // Single load point for LLM settings — all components read from Pinia state
  await useAppStore().fetchLlmSettings();
});

onBeforeUnmount(() => {
  unlistenSubscription.then(fn => fn()).catch(() => {});
  disposeAgentRuntime();
});
</script>
