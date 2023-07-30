<template>
  <div class="connect-container">
    <div class="connect-list">
      <div class="add-connect" @click="addConnect">
        <n-icon size="28">
          <Add />
        </n-icon>
        <span>新增连接</span>
      </div>
      <div class="list-content">
        <n-scrollbar style="height: 100%">
          <div class="list-item" v-for="(item, index) in 100" :key="index">
            {{ item + index }}
          </div>
        </n-scrollbar>
      </div>
    </div>
    <div class="connect-body"></div>
  </div>
  <add-connect-modal ref="addConnectModalRef" />
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';
import addConnectModal from './components/add-dialog.vue';

const addConnectModalRef = ref(null);

const addConnect = () => {
  addConnectModalRef.value.showMedal();
};
</script>

<style lang="scss" scoped>
.connect-container {
  height: 100%;
  width: 100%;
  display: flex;
  .connect-list {
    width: 200px;
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    .add-connect {
      height: 30px;
      margin: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      color: #fff;
      background-color: var(--theme-color);
      cursor: pointer;
    }
    .list-content {
      flex: 1;
      height: 0;
      padding-bottom: 10px;
      .list-item {
        margin: 0 10px;
      }
    }
  }
  .connect-body {
    flex: 1;
    width: 0;
  }
}
</style>
