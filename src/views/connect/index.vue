<template>
  <div class="connect-container">
    <div v-if="connectPanel" class="connect-list">
      <div class="add-connect" @click="addConnect">
        <n-icon size="28">
          <Add />
        </n-icon>
        <span>{{ $t('connection.new') }}</span>
      </div>
      <connect-list @edit-connect="editConnectHandler" />
    </div>
    <div class="connect-body">
      <div class="table-select">
        <collection-selector />
      </div>
      <div class="editor-container">
        <Editor />
      </div>
    </div>
  </div>
  <connect-modal ref="connectModalRef" />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add } from '@vicons/carbon';
import ConnectModal from './components/connect-dialog.vue';
import connectList from './components/connect-list.vue';
import collectionSelector from './components/collection-selector.vue';
import Editor from '../editor/index.vue';
import { useAppStore } from '../../store';

const appStore = useAppStore();
const { setConnectPanel } = appStore;
const { connectPanel } = storeToRefs(appStore);

// DOM
const connectModalRef = ref();

onMounted(() => {
  if (!connectPanel.value) {
    setConnectPanel();
  }
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
      transition: 0.3s;
      cursor: pointer;
      &:hover {
        background-color: var(--theme-color-hover);
      }
    }
  }
  .connect-body {
    flex: 1;
    width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    .table-select {
      height: 40px;
      border-bottom: 1px solid var(--border-color);
    }
    .editor-container {
      flex: 1;
      height: 0;
    }
  }
}
</style>
