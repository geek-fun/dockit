<template>
  <div class="history-container">
    <div class="history-container-list">
      <HistoryEmpty />
    </div>
    <div class="history-container-details">history</div>
  </div>
</template>

<script setup lang="ts">
import HistoryEmpty from './components/history-empty.vue';
</script>

<style scoped>
.history-container {
  height: 100%;
  width: 100%;
  display: flex;
}

.history-container-list {
  width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid hsl(var(--border));
}

.history-container-details {
  flex: 1;
  width: 0;
}
</style>
