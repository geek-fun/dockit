<template>
  <div class="setting-container">
    <n-tabs type="line" placement="left">
      <n-tab-pane n-tab-pane name="Basic" tab="通用设置">
        <basic-setting />
      </n-tab-pane>
      <n-tab-pane n-tab-pane name="About" tab="关于...">
        <basic-setting />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import BasicSetting from './components/basic.vue';
</script>

<style lang="scss" scoped>
.setting-container {
  height: 100%;
  width: 100%;
  padding: 15px;
  box-sizing: border-box;
  :deep(.n-tabs) {
    height: 100%;
    .n-tabs-nav-scroll-content {
      height: 100%;
    }
    .n-tab-pane {
      padding-left: 30px;
    }
  }
}
</style>
