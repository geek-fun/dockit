<template>
  <div class="manage-container">
    <tool-bar />
    <home-state class="state-container" :cluster="established" />
  </div>
</template>

<script setup lang="ts">
import ToolBar from './components/tool-bar.vue';
import HomeState from './components/home-state.vue';
import { useConnectionStore } from '../../store';
import { storeToRefs } from 'pinia';

const connectionStore = useConnectionStore();

const { established } = storeToRefs(connectionStore);
</script>

<style lang="scss" scoped>
.manage-container {
  display: flex;
  flex-direction: column;
  .state-container {
    flex: 1;
    height: 0;
  }
}
</style>
