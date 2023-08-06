<template>
  <div class="list-content">
    <n-scrollbar style="height: 100%">
      <div class="scroll-container">
        <div
          v-for="con in connections"
          :key="con.id"
          class="list-item"
          :class="{
            active: con.id === 7,
          }"
        >
          <div class="icon">
            <n-icon size="14">
              <component :is="con.id === 7 ? ConnectionSignal : ConnectionSignalOff" />
            </n-icon>
          </div>
          <div class="name">{{ con.name }}</div>
          <div class="opration">
            <n-dropdown
              trigger="hover"
              :options="options"
              @select="(args: number) => handleSelect(args, con)"
            >
              <n-icon size="20">
                <MoreOutlined />
              </n-icon>
            </n-dropdown>
          </div>
        </div>
      </div>
    </n-scrollbar>
  </div>
</template>

<script setup lang="ts">
// TODO: fix bug
import { MoreOutlined } from '@vicons/antd';
import { ConnectionSignal, ConnectionSignalOff } from '@vicons/carbon';
import { storeToRefs } from 'pinia';
import { useAppStore } from '../../../store';
import { useConnectionStore } from '../../../store/connectionStore';

const emits = defineEmits(['edit-connect']);

const appStore = useAppStore();

const isZhCN = computed(() => {
  return appStore.languageType === 'zhCN';
});
const options = reactive([
  {
    key: 1,
    label: isZhCN.value ? '连接' : 'Connect',
  },
  {
    key: 2,
    label: isZhCN.value ? '编辑' : 'Edit',
  },
  {
    key: 3,
    label: isZhCN.value ? '删除' : 'Delete',
  },
]);

const connectionStore = useConnectionStore();
const { fetchConnections } = connectionStore;
const { connections } = storeToRefs(connectionStore);

fetchConnections();

// dropdown select handler
const handleSelect = (key: number, row: object) => {
  switch (key) {
    case 1:
      connectItem(row);
      break;
    case 2:
      editCconnect(row);
      break;
    case 3:
      deleteConnect(row);
      break;
  }
};
// TODO:connect to the item
const connectItem = (row: object) => {
  console.log(row);
};
// edit connect info
const editCconnect = (row: object) => {
  emits('edit-connect', row);
};
// TODO:delete connect
const deleteConnect = (row: object) => {
  console.log(row);
};
</script>

<style lang="scss" scoped>
.list-content {
  flex: 1;
  height: 0;
  padding-bottom: 10px;
  .scroll-container {
    padding: 0 10px;
  }
  .list-item {
    width: 100%;
    height: 32px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    cursor: pointer;
    .icon {
      height: 100%;
      width: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--dange-color);
    }
    .name {
      flex: 1;
      width: 0;
      padding: 0 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .opration {
      height: 100%;
      width: 20px;
      display: none;
      align-items: center;
      justify-content: center;
    }
  }
  .list-item + .list-item {
    margin-top: 5px;
  }
  .list-item:hover {
    background-color: var(--connect-list-hover-bg);
    .opration {
      display: flex;
    }
  }
  .list-item.active {
    .icon,
    .name,
    .opration {
      color: var(--theme-color);
    }
  }
}
</style>
