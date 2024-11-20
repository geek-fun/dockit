<template>
  <main>
    <n-tabs type="segment" animated>
      <n-tab-pane name="backup" :tab="$t('backup.backup')">
        <Backup />
      </n-tab-pane>
      <n-tab-pane name="restore" :tab="$t('backup.restore')">
        <Restore />
      </n-tab-pane>
    </n-tabs>
  </main>
</template>

<script setup lang="ts">
import Backup from './components/backup.vue';
import Restore from './components/restore.vue';
</script>

<style lang="scss" scoped>
.backup-panel-container {
  display: flex;
  justify-content: space-around;
  margin: 10px 20px;

  .backup-action-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: 10px;

    & > i {
      cursor: pointer;
      margin: 10px 5px;

      &:hover {
        color: var(--theme-color-hover);
      }
    }
  }
}
</style>
