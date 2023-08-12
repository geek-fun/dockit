<template>
  <div class="connect-container">
    <div v-if="isPannelOpen" class="connect-list">
      <div class="add-connect" @click="addConnect">
        <n-icon size="28">
          <Add />
        </n-icon>
        <span>{{ $t('connection.new') }}</span>
      </div>
      <connect-list @edit-connect="editConnectHandler" />
    </div>
    <div class="connect-body">
      <Editor />
    </div>
  </div>
  <connect-modal ref="connectModalRef" />
</template>

<script setup lang="ts">
import { Add } from '@vicons/carbon';
import ConnectModal from './components/connect-dialog.vue';
import connectList from './components/connect-list.vue';
import Editor from '../editor/index.vue';
import { useAppStore } from './../../store';

const appStore = useAppStore();
// DOM
const connectModalRef = ref();

const isPannelOpen = computed(() => {
  return appStore.connectPannel;
});

const addConnect = () => connectModalRef.value.showMedal();

const editConnectHandler = (row: object) => {
  connectModalRef.value.showMedal(row);
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
    height: 100%;
  }
}
</style>
