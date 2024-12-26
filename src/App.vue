<template>
  <app-provider>
    <router-main />
    <version-detect />
  </app-provider>
</template>

<script setup lang="ts">
import AppProvider from './components/AppProvider.vue';
import RouterMain from './components/RouterMain.vue';
import VersionDetect from './components/VersionDetect.vue';
</script>