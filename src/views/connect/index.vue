<template>
  <div class="connect-container">
    <div class="connect-list">
      <div class="add-connect" @click="addConnect">
        <n-icon size="28">
          <Add />
        </n-icon>
        <span>{{ $t('connection.new') }}</span>
      </div>
      <connect-list @edit-connect="editConnectHandler" />
      <div class="connect-body"></div>
    </div>
  </div>
  <add-connect-modal ref="addConnectModalRef" />
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';
import addConnectModal from './components/add-dialog.vue';
import connectList from './components/connect-list.vue';
const addConnectModalRef = ref();

const addConnect = () => addConnectModalRef.value.showMedal();

const editConnectHandler = (row: object) => {
  addConnectModalRef.value.showMedal(row);
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
  }
  .connect-body {
    flex: 1;
    width: 0;
  }
}
</style>
