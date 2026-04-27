<template>
  <router-view v-slot="{ Component }">
    <keep-alive :include="keepAliveIncludes">
      <component :is="Component" :key="route.name" />
    </keep-alive>
  </router-view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const keepAliveIncludes = computed(() =>
  router
    .getRoutes()
    .filter(r => r.meta.keepAlive)
    .map(r => r.name as string)
    .filter(Boolean),
);
</script>
