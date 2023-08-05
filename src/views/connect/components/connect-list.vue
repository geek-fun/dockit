<template>
  <div class="list-content">
    <n-scrollbar style="height: 100%">
      <div v-for="con in connections" :key="con.id" class="list-item">
        {{ con.name }}
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useConnectionStore } from '../../../store/connectionStore';

const connectionStore = useConnectionStore();
const { fetchConnections } = connectionStore;
const { connections } = storeToRefs(connectionStore);

fetchConnections();
</script>

<style lang="scss" scoped>
.list-content {
  flex: 1;
  height: 0;
  padding-bottom: 10px;
  .list-item {
    margin: 0 10px;
  }
}
.connect-body {
  flex: 1;
  width: 0;
}
</style>
