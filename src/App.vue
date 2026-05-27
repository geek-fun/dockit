<template>
  <app-provider>
    <router-main />
    <version-detect />
  </app-provider>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import AppProvider from './components/AppProvider.vue';
import RouterMain from './components/RouterMain.vue';
import VersionDetect from './components/VersionDetect.vue';
import { initAgentRuntime, disposeAgentRuntime } from '@/composables/agentRuntime';
import { useAppStore } from '@/store';

onMounted(async () => {
  void initAgentRuntime();
  // Single load point for LLM settings — all components read from Pinia state
  await useAppStore().fetchLlmSettings();
});

onBeforeUnmount(() => {
  disposeAgentRuntime();
});
</script>
