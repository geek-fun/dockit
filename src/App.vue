<template>
  <n-config-provider>
    <n-message-provider>
      <router-view />
      <version-detect />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { NConfigProvider, NMessageProvider } from 'naive-ui';
import VersionDetect from './components/VersionDetect.vue';
</script>
