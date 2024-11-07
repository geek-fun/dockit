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
      <div class="connect-toolbar">
        <collection-selector />
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-icon size="20" class="action-load-icon" @click="handleLoadAction">
              <AiStatus />
            </n-icon>
          </template>
          {{ $t('editor.loadDefault') }}
        </n-tooltip>
        <path-breadcrumb :clickable="false" />
      </div>
      <div class="editor-container">
        <Editor />
      </div>
    </div>
  </div>
  <connect-dialog ref="connectDialogRef" />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Add, AiStatus } from '@vicons/carbon';
import { useAppStore, useSourceFileStore } from '../../store';
import ConnectDialog from './components/connect-dialog.vue';
import connectList from './components/connect-list.vue';
import collectionSelector from './components/collection-selector.vue';
import Editor from '../editor/index.vue';
import PathBreadcrumb from '../../components/PathBreadcrumb.vue';

const appStore = useAppStore();
const { setConnectPanel } = appStore;
const { connectPanel } = storeToRefs(appStore);
const fileStore = useSourceFileStore();
const { readSourceFromFile } = fileStore;
// DOM
const connectDialogRef = ref();

onMounted(() => {
  if (!connectPanel.value) {
    setConnectPanel();
  }
});

const addConnect = () => connectDialogRef.value.showMedal();

const editConnectHandler = (row: object) => {
  connectDialogRef.value.showMedal(row);
};
const handleLoadAction = async () => {
  await readSourceFromFile(undefined);
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

    .connect-toolbar {
      display: flex;
      align-items: center;
      height: var(--tool-bar-height);
      border-bottom: 1px solid var(--border-color);

      .action-load-icon {
        margin-left: 10px;
        cursor: pointer;
        color: gray;

        &:hover {
          color: var(--theme-color);
        }
      }
    }

    .editor-container {
      flex: 1;
      height: 0;
    }
  }
}
</style>
