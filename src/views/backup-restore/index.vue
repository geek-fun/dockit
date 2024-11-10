<template>
  <main>
    <n-tabs type="segment" animated>
      <n-tab-pane name="backup" :tab="$t('backup.backup')">
        <div>backup</div>
      </n-tab-pane>
      <n-tab-pane name="restore" :tab="$t('backup.restore')">
        <div>restore</div>
      </n-tab-pane>
      <template #suffix>
        <div class="backup-restore-placeholder"></div>
      </template>
    </n-tabs>
  </main>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.backup-restore-placeholder {
  //flex: 1;
  //width: 50%;
}
</style>
